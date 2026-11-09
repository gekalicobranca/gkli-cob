begin;

create table public.easy_pague_consultas (
  id uuid primary key default gen_random_uuid(),
  configuracao_id uuid not null references public.scanner_configuracoes(id) on delete cascade,
  carteira_id uuid not null references public.carteiras(id) on delete cascade,
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  unidade_portal text not null,
  data_limite date not null,
  solicitado_por uuid not null,
  alvos jsonb not null,
  resultados jsonb not null default '[]',
  estado text not null default 'fila' check (estado in ('fila','consultando','concluido','falha')),
  tentativas integer not null default 0,
  token uuid,
  reservado_ate timestamptz,
  criado_em timestamptz not null default now(),
  unique(configuracao_id, unidade_id, data_limite)
);
create index easy_pague_fila_idx on public.easy_pague_consultas(criado_em, id) where estado in ('fila','consultando');
alter table public.easy_pague_consultas enable row level security;
revoke all on public.easy_pague_consultas from public,anon,authenticated;
grant select,insert,update on public.easy_pague_consultas to service_role;

create function public.easy_pague_parcelas(p_carteiras uuid[], p_administradora text)
returns table (
  administradora text, nome_administradora text, condominio text, condominio_id uuid,
  carteira_id uuid, unidade_id uuid, unidade text, bloco text, acordo_id uuid,
  parcela_id uuid, numero integer, vencimento date, valor numeric, configuracao_id uuid,
  unidade_portal text, acordo_externo text, recibo text, data_limite date
)
language sql stable security invoker set search_path='' as $$
  select lower(trim(c.administradora)), trim(c.administradora), c.nome, c.id, c.carteira_id,
    u.id, u.identificacao, u.bloco, a.id, p.id, p.numero::integer, p.vencimento, p.valor,
    case when alvo.unidade_portal = any(s.unidades) then s.id end,
    alvo.unidade_portal, f.numero_acordo,
    case when s.portal in ('bbz','manager','sell') and not exists (
      select 1 from public.parcelas_acordo outra
      join public.acordos vinculo on vinculo.id=outra.acordo_id
      where outra.id<>p.id and vinculo.unidade_id=u.id and vinculo.condominio_id=c.id
        and vinculo.carteira_id=c.carteira_id
        and recibo.numero in (public.cobranca_recibo_arquivo(outra.observacoes),
          case when s.portal='bbz' then public.scanner_bbz_recibo_parcela(outra.id) end)
    ) then recibo.numero end,
    (now() at time zone 'America/Sao_Paulo')::date - 1
  from public.parcelas_acordo p
  join public.acordos a on a.id=p.acordo_id
  join public.condominios c on c.id=a.condominio_id and c.carteira_id=a.carteira_id
  join public.unidades u on u.id=a.unidade_id and u.condominio_id=c.id and u.carteira_id=c.carteira_id
  left join public.scanner_configuracoes s on s.condominio_id=c.id and s.ativo and s.situacao='validado'
    and s.portal in ('lello','manager','bbz','sell')
    and (s.financeiro_proxima_tentativa is null or s.financeiro_proxima_tentativa<=now())
  left join lateral (
    select min(f.numero_acordo) numero_acordo, min(f.fonte_json->>'unidade') unidade
    from public.acordos_fontes_lello f
    where s.portal='lello' and f.acordo_id=a.id and f.condominio_id=c.id
      and f.unidade_id=u.id and f.carteira_id=c.carteira_id and f.codigo_condominio=s.codigo_portal
      and not exists (
        select 1 from public.acordos_fontes_lello outro
        where outro.acordo_id<>a.id and outro.condominio_id=c.id and outro.carteira_id=c.carteira_id
          and outro.codigo_condominio=f.codigo_condominio and outro.numero_acordo=f.numero_acordo
      )
    having count(distinct (f.numero_acordo,f.fonte_json->>'unidade'))=1
  ) f on true
  cross join lateral (
    select case when s.portal='lello' then coalesce(f.unidade,u.identificacao) else u.id::text end unidade_portal
  ) alvo
  cross join lateral (
    select coalesce(case when s.portal='bbz' then public.scanner_bbz_recibo_parcela(p.id) end,
      public.cobranca_recibo_arquivo(p.observacoes)) numero
  ) recibo
  where c.status='ativo' and nullif(trim(c.administradora),'') is not null
    and (p_administradora is null or lower(trim(c.administradora))=p_administradora)
    and (p_carteiras is null or c.carteira_id=any(p_carteiras))
    and a.status in ('ativo','em_dia','em_atraso','vencido')
    and p.status in ('aberta','vencida','pendente') and p.data_pagamento is null
    and p.vencimento <= (now() at time zone 'America/Sao_Paulo')::date - 1;
$$;

create function public.easy_pague_administradoras(p_carteiras uuid[])
returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'dataLimite',(now() at time zone 'America/Sao_Paulo')::date-1,
    'administradoras',coalesce(jsonb_agg(to_jsonb(grupo) order by grupo.nome),'[]')
  )
  from (
    select lower(trim(c.administradora)) id, min(trim(c.administradora)) nome
    from public.condominios c
    where c.status='ativo' and nullif(trim(c.administradora),'') is not null
      and (p_carteiras is null or c.carteira_id=any(p_carteiras))
      and exists (
        select 1 from public.acordos a
        join public.unidades u on u.id=a.unidade_id and u.condominio_id=c.id and u.carteira_id=c.carteira_id
        join public.parcelas_acordo p on p.acordo_id=a.id
        where a.condominio_id=c.id and a.carteira_id=c.carteira_id
          and a.status in ('ativo','em_dia','em_atraso','vencido')
          and p.status in ('aberta','vencida','pendente') and p.data_pagamento is null
          and p.vencimento <= (now() at time zone 'America/Sao_Paulo')::date-1
      )
    group by lower(trim(c.administradora))
  ) grupo;
$$;

create function public.easy_pague_painel(p_carteiras uuid[], p_administradora text)
returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'dataLimite',(now() at time zone 'America/Sao_Paulo')::date-1,
    'parcelas',coalesce(jsonb_agg(to_jsonb(p) - 'recibo' - 'unidade_portal' ||
      jsonb_build_object('estado',q.estado,'resultado',r.item)
      order by p.nome_administradora,p.condominio,p.bloco,p.unidade,p.vencimento,p.parcela_id),'[]')
  )
  from public.easy_pague_parcelas(p_carteiras,p_administradora) p
  left join public.easy_pague_consultas q on q.configuracao_id=p.configuracao_id and q.unidade_id=p.unidade_id
    and q.carteira_id=p.carteira_id and q.data_limite=p.data_limite
  left join lateral (
    select item from jsonb_array_elements(q.resultados) item where item->>'parcela_id'=p.parcela_id::text limit 1
  ) r on true;
$$;

create function public.easy_pague_solicitar(p_carteiras uuid[], p_administradora text, p_usuario uuid)
returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if nullif(p_administradora,'') is null or p_usuario is null then raise exception 'Pedido inválido.'; end if;
  insert into public.easy_pague_consultas(configuracao_id,carteira_id,unidade_id,unidade_portal,data_limite,solicitado_por,alvos)
  select configuracao_id,carteira_id,unidade_id,unidade_portal,data_limite,p_usuario,
    jsonb_agg(jsonb_build_object('parcela_id',parcela_id,'acordo_id',acordo_id,'numero',numero,'vencimento',vencimento,
      'valor',valor,'acordo_externo',acordo_externo,'recibo',recibo))
  from public.easy_pague_parcelas(p_carteiras,p_administradora)
  where configuracao_id is not null
  group by configuracao_id,carteira_id,unidade_id,unidade_portal,data_limite
  on conflict (configuracao_id,unidade_id,data_limite) do nothing;
  get diagnostics n=row_count;
  return n;
end;
$$;

create function public.easy_pague_reservar(p_token uuid)
returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.scanner_configuracoes; controle public.scanner_controle; jobs jsonb;
begin
  if p_token is null then raise exception 'Token obrigatório.'; end if;
  select * into strict controle from public.scanner_controle where id for update;
  if controle.reservado_ate>now() then return null; end if;
  update public.easy_pague_consultas set estado='falha',token=null,reservado_ate=null
  where (estado='consultando' and reservado_ate<=now() and tentativas>=3)
    or (estado in ('fila','consultando') and data_limite < (now() at time zone 'America/Sao_Paulo')::date-1);
  select s.* into cfg from public.easy_pague_consultas q
  join public.scanner_configuracoes s on s.id=q.configuracao_id
  join public.condominios c on c.id=s.condominio_id and c.carteira_id=q.carteira_id
  join public.unidades u on u.id=q.unidade_id and u.condominio_id=c.id and u.carteira_id=c.carteira_id
  where (q.estado='fila' or (q.estado='consultando' and q.reservado_ate<=now()))
    and s.ativo and s.situacao='validado' and c.status='ativo' and q.unidade_portal=any(s.unidades)
    and (s.financeiro_proxima_tentativa is null or s.financeiro_proxima_tentativa<=now())
  order by q.criado_em,q.id limit 1;
  if cfg.id is null then return null; end if;
  with reservados as (
    update public.easy_pague_consultas q set estado='consultando',token=p_token,
      reservado_ate=now()+interval '5 minutes',tentativas=q.tentativas+1
    where q.id in (
      select j.id from public.easy_pague_consultas j
      join public.condominios c on c.id=cfg.condominio_id and c.carteira_id=j.carteira_id
      join public.unidades u on u.id=j.unidade_id and u.condominio_id=c.id and u.carteira_id=c.carteira_id
      where j.configuracao_id=cfg.id and j.unidade_portal=any(cfg.unidades)
        and (j.estado='fila' or (j.estado='consultando' and j.reservado_ate<=now()))
      order by j.criado_em,j.id limit 10
    ) returning q.*
  ) select jsonb_agg(to_jsonb(r) order by r.criado_em,r.id) into jobs from reservados r;
  update public.scanner_controle set token=p_token,configuracao_id=cfg.id,reservado_ate=now()+interval '5 minutes' where id;
  return jsonb_build_object('configuracao',to_jsonb(cfg),'pedidos',jobs);
end;
$$;

revoke all on function public.easy_pague_administradoras(uuid[]),public.easy_pague_parcelas(uuid[],text),public.easy_pague_painel(uuid[],text),
  public.easy_pague_solicitar(uuid[],text,uuid),public.easy_pague_reservar(uuid) from public,anon,authenticated;
grant execute on function public.easy_pague_administradoras(uuid[]),public.easy_pague_parcelas(uuid[],text),public.easy_pague_painel(uuid[],text),
  public.easy_pague_solicitar(uuid[],text,uuid),public.easy_pague_reservar(uuid) to service_role;
notify pgrst,'reload schema';
commit;
