begin;

alter table public.easy_espelhamentos
  add column tentar_em timestamptz,
  add column resumo jsonb;

create function public.easy_espelhamento_resumir(p_resultado jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select case when p_resultado is not null then jsonb_build_object(
    'cotas',p_resultado->'cotas','acordos',p_resultado->'acordos','parcelasPagas',p_resultado->'parcelasPagas',
    'pendencias',case when jsonb_typeof(p_resultado->'pendencias')='array' then jsonb_array_length(p_resultado->'pendencias') else 0 end,
    'erro',p_resultado->'erro') end;
$$;

update public.easy_espelhamentos set resumo=public.easy_espelhamento_resumir(resultado) where resultado is not null;

create function public.easy_espelhamento_atualizar_resumo()
returns trigger language plpgsql set search_path='' as $$
begin
  new.resumo := public.easy_espelhamento_resumir(new.resultado);
  return new;
end;
$$;
create trigger easy_espelhamento_resultado_resumo before insert or update of resultado on public.easy_espelhamentos
  for each row execute function public.easy_espelhamento_atualizar_resumo();

create function public.easy_espelhamento_painel_resumo(p_carteiras uuid[])
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome,'nomeOperacional',c.nome_operacional,'carteira',ct.nome,
    'administradoras',catalogo.administradoras,'agendado',c.easy_espelhamento_agendado,
    'ultimaConferenciaEm',consulta.concluido_em,'ultimoEspelhamentoEm',espelho.concluido_em,
    'execucao',case when recente.id is not null then jsonb_build_object('id',recente.id,'estado',recente.estado,'aplicar',recente.aplicar,
      'resumo',recente.resumo,'concluidoEm',recente.concluido_em) end) order by c.nome,c.id),'[]')
  from (select r.condominio_id, jsonb_agg(distinct r.administradora order by r.administradora) administradoras
        from public.easy_espelhamento_receitas(p_carteiras) r group by r.condominio_id) catalogo
  join public.condominios c on c.id=catalogo.condominio_id
  join public.carteiras ct on ct.id=c.carteira_id
  left join lateral (select e.id,e.estado,e.aplicar,e.resumo,e.concluido_em from public.easy_espelhamentos e
    where e.condominio_id=c.id and e.carteira_id=c.carteira_id order by e.criado_em desc,e.id desc limit 1) recente on true
  left join lateral (select e.concluido_em from public.easy_espelhamentos e
    where e.condominio_id=c.id and e.carteira_id=c.carteira_id and e.estado='concluido' order by e.concluido_em desc limit 1) consulta on true
  left join lateral (select e.concluido_em from public.easy_espelhamentos e
    where e.condominio_id=c.id and e.carteira_id=c.carteira_id and e.estado='concluido' and e.aplicar
      and e.resumo->'pendencias'='0'::jsonb order by e.concluido_em desc limit 1) espelho on true;
$$;

create function public.easy_espelhamento_periodos_bordero(p_data_base date)
returns table (id uuid,inicio date,fim date,status text)
language sql stable security invoker set search_path='' as $$
  with vigente as (
    select p.id,p.data_abertura,p.data_fechamento,p.status from public.fechamento_periodos p
    where p.status not in ('rascunho','cancelado') and p.data_abertura<=p_data_base and p.data_fechamento>=p_data_base
    order by p.data_abertura desc,p.data_fechamento limit 1
  ), anterior as (
    select p.id,p.data_abertura,p.data_fechamento,p.status from public.fechamento_periodos p
    where p.status not in ('rascunho','cancelado') and p.data_fechamento<coalesce((select v.data_abertura from vigente v),p_data_base)
    order by p.data_fechamento desc,p.data_abertura desc limit 2
  )
  select v.id,v.data_abertura,v.data_fechamento,v.status from (
    select * from vigente union all select * from anterior
  ) v order by v.data_fechamento desc limit 2;
$$;

create function public.easy_espelhamento_familia(p_administradora text)
returns text language sql immutable set search_path='' as $$
  select case lower(coalesce(p_administradora,'lello'))
    when 'lello' then 'lello' when 'manager' then 'manager'
    when 'bbz' then 'webware' when 'atipass' then 'webware' when 'sell' then 'webware'
    when 'villágua' then 'webware' when 'villagua' then 'webware'
    else 'outros' end;
$$;
create index easy_espelhamentos_fila_familia_idx on public.easy_espelhamentos
  (public.easy_espelhamento_familia(administradora),criado_em,id) where estado in ('fila','processando');
create index easy_espelhamentos_concluido_idx on public.easy_espelhamentos(condominio_id,carteira_id,concluido_em desc)
  where estado='concluido';

create function public.easy_espelhamento_fila_disponivel()
returns table (familia text,criado_em timestamptz)
language sql stable security invoker set search_path='' as $$
  select public.easy_espelhamento_familia(e.administradora),min(e.criado_em)
  from public.easy_espelhamentos e
  where ((e.estado='fila' and (e.tentar_em is null or e.tentar_em<=now()))
     or (e.estado='processando' and e.iniciado_em<now()-interval '20 minutes'))
    and not exists(select 1 from public.easy_espelhamentos ativo
      where ativo.estado='processando' and ativo.iniciado_em>=now()-interval '20 minutes'
        and public.easy_espelhamento_familia(ativo.administradora)=public.easy_espelhamento_familia(e.administradora))
  group by 1;
$$;

create function public.easy_espelhamento_reservar_familia(p_familia text)
returns setof public.easy_espelhamentos language plpgsql security invoker set search_path='' as $$
begin
  if p_familia not in ('lello','manager','webware','outros') then return; end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('easy-espelhamento:'||p_familia,0)) then return; end if;
  if exists(select 1 from public.easy_espelhamentos e where e.estado='processando'
    and e.iniciado_em>=now()-interval '20 minutes' and public.easy_espelhamento_familia(e.administradora)=p_familia) then return; end if;
  update public.easy_espelhamentos e set estado='falha',concluido_em=now(),
    resultado=jsonb_build_object('erro','O agente perdeu a reserva. Solicite uma nova conferência.')
  where public.easy_espelhamento_familia(e.administradora)=p_familia and estado='processando'
    and iniciado_em<now()-interval '20 minutes' and tentativas>=2;
  return query update public.easy_espelhamentos e
    set estado='processando',iniciado_em=now(),tentativas=e.tentativas+1,tentar_em=null,resultado=null
    where e.id=(select p.id from public.easy_espelhamentos p
      where public.easy_espelhamento_familia(p.administradora)=p_familia and (
        (p.estado='fila' and (p.tentar_em is null or p.tentar_em<=now()))
        or (p.estado='processando' and p.iniciado_em<now()-interval '20 minutes' and p.tentativas<2))
      order by p.criado_em,p.id limit 1 for update skip locked)
    returning e.*;
end;
$$;

create table public.easy_espelhamento_etapas (
  espelhamento_id uuid not null references public.easy_espelhamentos(id) on delete cascade,
  etapa text not null check (etapa in ('cotas','historicos','acordos')),
  dados jsonb not null,
  coletado_em timestamptz not null default now(),
  primary key(espelhamento_id,etapa)
);
alter table public.easy_espelhamento_etapas enable row level security;
revoke all on public.easy_espelhamento_etapas from public,anon,authenticated;
grant select,insert,update,delete on public.easy_espelhamento_etapas to service_role;

create function public.easy_espelhamento_salvar_etapa(p_id uuid,p_tentativa integer,p_etapa text,p_dados jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.easy_espelhamentos where id=p_id and estado='processando' and tentativas=p_tentativa for update;
  if not found then raise exception 'Reserva de espelhamento vencida.'; end if;
  insert into public.easy_espelhamento_etapas(espelhamento_id,etapa,dados)
  values(p_id,p_etapa,p_dados) on conflict (espelhamento_id,etapa) do update set dados=excluded.dados,coletado_em=now();
end;
$$;

create function public.easy_espelhamento_limpar_etapas()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.estado in ('concluido','falha') then
    delete from public.easy_espelhamento_etapas where espelhamento_id=new.id;
  end if;
  return new;
end;
$$;
create trigger easy_espelhamento_estado_limpar_etapas after update of estado on public.easy_espelhamentos
  for each row when (old.estado is distinct from new.estado) execute function public.easy_espelhamento_limpar_etapas();

-- Atualiza as regras de baixa na função já publicada, mantendo as duas famílias de evidência e a tabela de créditos.
do $$
declare
  def text:=pg_get_functiondef('public.easy_espelhamento_concluir(uuid,integer,text,jsonb)'::regprocedure);
  quitacao text:=$s$if not exists(select 1 from public.parcelas_acordo where acordo_id=acordo.id and status not in ('paga','cancelada')) then$s$;
  parcial text:=$s$update public.acordos set status_financeiro='parcial',ultima_sincronizacao_status_em=now() where id=acordo.id and status<>'quitado';$s$;
begin
  if strpos(def,quitacao)=0 or strpos(def,parcial)=0 or strpos(def,'Data de pagamento futura.')=0 then
    raise exception 'A definição de baixa mudou. Revise a integração do espelhamento.';
  end if;
  def:=replace(def,$s$if (item->>'dataPagamento')::date > hoje then raise exception 'Data de pagamento futura.'; end if;$s$,
    $s$if (item->>'dataPagamento')::date is null or (item->>'dataPagamento')::date > hoje
            or coalesce(item->>'recibo','') !~ '^[0-9]{5,}$' then raise exception 'Recibo ou data de pagamento inválidos.'; end if;$s$);
  def:=replace(def,$s$or round(parcela.valor*100)<>(item->>'valorPago')::numeric or (item->>'dataPagamento')::date>hoje then$s$,
    $s$or round(parcela.valor*100)<>(item->>'valorPago')::numeric or (item->>'dataPagamento')::date is null or (item->>'dataPagamento')::date>hoje then$s$);
  def:=replace(def,quitacao,$s$if not exists(select 1 from public.parcelas_acordo where acordo_id=acordo.id
                and status<>'cancelada' and (status<>'paga' or data_pagamento is null))
              and (select coalesce(sum(valor),0) from public.parcelas_acordo where acordo_id=acordo.id and status='paga')=acordo.valor_acordado then$s$);
  def:=replace(def,parcial,$s$update public.acordos set status=case
              when exists(select 1 from public.parcelas_acordo p where p.acordo_id=acordo.id and p.vencimento<hoje and p.status not in ('paga','cancelada')) then 'em_atraso'
              when exists(select 1 from public.parcelas_acordo p where p.acordo_id=acordo.id and p.status not in ('paga','cancelada')) then 'em_dia'
              else acordo.status end,
              status_financeiro='parcial',ultima_sincronizacao_status_em=now() where id=acordo.id and status<>'quitado';$s$);
  execute def;
end;
$$;

revoke all on function public.easy_espelhamento_resumir(jsonb),public.easy_espelhamento_atualizar_resumo(),
  public.easy_espelhamento_painel_resumo(uuid[]),public.easy_espelhamento_periodos_bordero(date),
  public.easy_espelhamento_familia(text),public.easy_espelhamento_fila_disponivel(),public.easy_espelhamento_reservar_familia(text),
  public.easy_espelhamento_salvar_etapa(uuid,integer,text,jsonb),public.easy_espelhamento_limpar_etapas() from public,anon,authenticated;
grant execute on function public.easy_espelhamento_resumir(jsonb),public.easy_espelhamento_atualizar_resumo(),
  public.easy_espelhamento_painel_resumo(uuid[]),public.easy_espelhamento_periodos_bordero(date),
  public.easy_espelhamento_familia(text),public.easy_espelhamento_fila_disponivel(),public.easy_espelhamento_reservar_familia(text),
  public.easy_espelhamento_salvar_etapa(uuid,integer,text,jsonb),public.easy_espelhamento_limpar_etapas() to service_role;

notify pgrst,'reload schema';
commit;
