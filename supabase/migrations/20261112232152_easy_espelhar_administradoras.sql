begin;

create function public.easy_espelhamento_receitas(p_carteiras uuid[])
returns table(condominio_id uuid, receita_id uuid, carteira_id uuid, administradora_id uuid, administradora text, script_key text)
language sql stable security invoker set search_path='' as $$
  select c.id,r.id,c.carteira_id,d.id,case when r.script_key='captacao_lello' then 'Lello' else d.nome end,r.script_key
  from public.condominios c
  join public.agente_receitas r on r.config_json->>'condominio_id'=c.id::text and r.carteira_id=c.carteira_id and r.ativo
  join public.agente_administradoras d on d.id=r.administradora_id and d.ativo
  where c.status='ativo' and (p_carteiras is null or c.carteira_id=any(p_carteiras))
  and r.script_key in ('captacao_lello','manager_atentum_cotas_pendentes','bbz_condopro_clock_vila_romana','captacao_atipass','captacao_graiche',
    'captacao_habitacional','captacao_hflex','captacao_sell','verti_winker_inadimplencia','villagua_condopro_square_guarulhos');
$$;

create or replace function public.easy_espelhamento_condominios(p_carteiras uuid[])
returns table (id uuid, carteira_id uuid, nome text, nome_operacional text, carteira text)
language sql stable security invoker set search_path='' as $$
  select c.id,c.carteira_id,c.nome,c.nome_operacional,ct.nome
  from public.condominios c join public.carteiras ct on ct.id=c.carteira_id
  where exists(select 1 from public.easy_espelhamento_receitas(p_carteiras) r where r.condominio_id=c.id);
$$;

create or replace function public.easy_espelhamento_painel(p_carteiras uuid[])
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome,'nomeOperacional',c.nome_operacional,'carteira',c.carteira,
    'administradoras',catalogo.administradoras,'ultimaConferenciaEm',consulta.concluido_em,'ultimoEspelhamentoEm',espelho.concluido_em,
    'execucao',case when recente.id is not null then jsonb_build_object('id',recente.id,'estado',recente.estado,'aplicar',recente.aplicar,
      'resultado',recente.resultado,'concluidoEm',recente.concluido_em) end) order by c.nome,c.id),'[]')
  from public.easy_espelhamento_condominios(p_carteiras) c
  cross join lateral (select jsonb_agg(distinct r.administradora order by r.administradora) administradoras
    from public.easy_espelhamento_receitas(p_carteiras) r where r.condominio_id=c.id) catalogo
  left join lateral (select e.id,e.estado,e.aplicar,e.resultado,e.concluido_em from public.easy_espelhamentos e
    where e.condominio_id=c.id and e.carteira_id=c.carteira_id order by e.criado_em desc,e.id desc limit 1) recente on true
  left join lateral (select e.concluido_em from public.easy_espelhamentos e
    where e.condominio_id=c.id and e.carteira_id=c.carteira_id and e.estado='concluido' order by e.concluido_em desc limit 1) consulta on true
  left join lateral (select e.concluido_em from public.easy_espelhamentos e
    where e.condominio_id=c.id and e.carteira_id=c.carteira_id and e.estado='concluido' and e.aplicar
      and e.resultado->'pendencias'='[]'::jsonb order by e.concluido_em desc limit 1) espelho on true;
$$;

alter table public.easy_espelhamentos add column administradora text;
alter table public.easy_espelhamentos add column demonstrativo_repasses jsonb;

create function public.easy_espelhamento_solicitar_administradora(p_carteiras uuid[], p_usuario uuid, p_lote uuid, p_condominios uuid[], p_aplicar boolean, p_administradora text, p_demonstrativo jsonb default null)
returns integer language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if p_usuario is null or p_lote is null or nullif(p_administradora,'') is null or coalesce(cardinality(p_condominios),0) not between 1 and 500 then raise exception 'Pedido inválido.'; end if;
  if exists(select 1 from unnest(p_condominios) alvo where alvo not in (select condominio_id from public.easy_espelhamento_receitas(p_carteiras) where administradora=p_administradora)) then
    raise exception 'Condomínio fora das carteiras permitidas ou da administradora selecionada.';
  end if;
  if p_demonstrativo is not null and (cardinality(p_condominios)<>1 or not exists(select 1 from public.condominios c where c.id=p_condominios[1]
    and regexp_replace(coalesce(c.cnpj,''),'[^0-9]','','g')=p_demonstrativo->>'cnpj') or coalesce(p_demonstrativo->>'sha256','') !~ '^[a-f0-9]{64}$') then
    raise exception 'O demonstrativo deve pertencer ao único condomínio selecionado.';
  end if;
  insert into public.easy_espelhamentos(lote,condominio_id,carteira_id,solicitado_por,aplicar,administradora,demonstrativo_repasses)
    select distinct p_lote,r.condominio_id,r.carteira_id,p_usuario,coalesce(p_aplicar,false),p_administradora,p_demonstrativo
    from public.easy_espelhamento_receitas(p_carteiras) r where r.condominio_id=any(p_condominios) and r.administradora=p_administradora
    on conflict do nothing;
  get diagnostics n=row_count;
  return n;
end;
$$;

create table public.easy_espelhamento_fontes (
  espelhamento_id uuid not null references public.easy_espelhamentos(id),
  receita_id uuid not null references public.agente_receitas(id),
  execucao_id uuid not null unique references public.agente_execucoes(id),
  primary key(espelhamento_id,receita_id)
);
alter table public.easy_espelhamento_fontes enable row level security;
revoke all on public.easy_espelhamento_fontes from public, anon, authenticated;
grant select, insert, update on public.easy_espelhamento_fontes to service_role;

create function public.easy_espelhamento_captar_fonte(p_espelhamento uuid, p_tentativa integer, p_receita uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare job public.easy_espelhamentos%rowtype; receita record; execucao uuid;
begin
  select * into strict job from public.easy_espelhamentos where id=p_espelhamento and estado='processando' and tentativas=p_tentativa for update;
  select * into strict receita from public.easy_espelhamento_receitas(array[job.carteira_id]) r
    where r.receita_id=p_receita and r.condominio_id=job.condominio_id and r.administradora=job.administradora;
  select f.execucao_id into execucao from public.easy_espelhamento_fontes f where f.espelhamento_id=job.id and f.receita_id=receita.receita_id;
  if execucao is not null then return execucao; end if;
  insert into public.agente_execucoes(receita_id,administradora_id,carteira_id,condominio_id,status,tentativas,origem,agendado_para,solicitado_por,easy_maestro_montar_flow)
    values(receita.receita_id,receita.administradora_id,job.carteira_id,job.condominio_id,'pendente',0,'espelhamento','infinity',job.solicitado_por,false)
    returning id into execucao;
  insert into public.easy_espelhamento_fontes values(job.id,receita.receita_id,execucao);
  return execucao;
end;
$$;

revoke all on function public.easy_espelhamento_receitas(uuid[]), public.easy_espelhamento_solicitar_administradora(uuid[],uuid,uuid,uuid[],boolean,text,jsonb), public.easy_espelhamento_captar_fonte(uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.easy_espelhamento_receitas(uuid[]), public.easy_espelhamento_solicitar_administradora(uuid[],uuid,uuid,uuid[],boolean,text,jsonb), public.easy_espelhamento_captar_fonte(uuid,integer,uuid) to service_role;

create or replace function public.easy_espelhamento_solicitar(p_carteiras uuid[], p_usuario uuid, p_lote uuid, p_condominios uuid[], p_aplicar boolean)
returns integer language sql security invoker set search_path='' as $$
  select public.easy_espelhamento_solicitar_administradora(p_carteiras,p_usuario,p_lote,p_condominios,p_aplicar,'Lello');
$$;

create table public.easy_espelhamento_repasses (
  parcela_id uuid primary key references public.parcelas_acordo(id),
  espelhamento_id uuid not null references public.easy_espelhamentos(id),
  acordo_id uuid not null references public.acordos(id),
  carteira_id uuid not null references public.carteiras(id),
  condominio_id uuid not null references public.condominios(id),
  recibo text not null,
  referencia text not null,
  portal text not null,
  fonte text not null,
  data_credito date not null,
  valor_centavos bigint not null check(valor_centavos>0),
  criado_em timestamptz not null default now(),
  unique(carteira_id,condominio_id,portal,referencia)
);
alter table public.easy_espelhamento_repasses enable row level security;
revoke all on public.easy_espelhamento_repasses from public, anon, authenticated;
grant select, insert on public.easy_espelhamento_repasses to service_role;

create function public.easy_espelhamento_recibos(p_condominio uuid, p_carteira uuid)
returns table(id uuid, recibo text)
language sql stable security invoker set search_path='' as $$
  select p.id,coalesce(public.scanner_bbz_recibo_parcela(p.id),public.cobranca_recibo_arquivo(p.observacoes))
  from public.parcelas_acordo p join public.acordos a on a.id=p.acordo_id where a.condominio_id=p_condominio and a.carteira_id=p_carteira;
$$;
revoke all on function public.easy_espelhamento_recibos(uuid,uuid) from public, anon, authenticated;
grant execute on function public.easy_espelhamento_recibos(uuid,uuid) to service_role;

-- Mantém a transação de aplicação, a trilha de auditoria e as regras de cotas já publicadas.
do $$
declare
  def text := pg_get_functiondef('public.easy_espelhamento_concluir(uuid,integer,text,jsonb)'::regprocedure);
  marcador text := '  if not exists(select 1 from public.agente_receitas r join public.agente_administradoras d on d.id=r.administradora_id';
begin
  if position(marcador in def)=0 or position($s$        when 'parcela_paga' then$s$ in def)=0 then raise exception 'Definição de espelhamento mudou; revise a migração.'; end if;
  def := replace(def,marcador,$s$  if p_codigo like 'receita:%' then
    if not exists(select 1 from public.easy_espelhamento_fontes f join public.agente_execucoes e on e.id=f.execucao_id
      join public.easy_espelhamento_receitas(array[pedido.carteira_id]) r on r.receita_id=f.receita_id
      where f.espelhamento_id=pedido.id and r.condominio_id=pedido.condominio_id and e.origem='espelhamento'
        and r.administradora=pedido.administradora and e.status='sucesso' and f.receita_id::text=substring(p_codigo from 9)) then
      raise exception 'A coleta da administradora não pertence a este espelhamento.';
    end if;
  els$s$||ltrim(marcador));
  def := replace(def,$s$        if public.chave_unidade_lello(unidade.identificacao,unidade.bloco) is distinct from public.chave_unidade_lello(item->>'unidade',null) then$s$,
    $s$        if (case when p_codigo like 'receita:%' then unidade.identificacao is distinct from item->>'unidadeLocal' or unidade.bloco is distinct from item->>'blocoLocal'
          else public.chave_unidade_lello(unidade.identificacao,unidade.bloco) is distinct from public.chave_unidade_lello(item->>'unidade',null) end) then$s$);
  def := replace(def,$s$        when 'parcela_paga' then$s$,$s$        when 'parcela_paga_extrato', 'repasse_creditado' then
          select a.* into strict acordo from public.acordos a where a.id=(item->>'acordoId')::uuid and a.unidade_id=unidade.id
            and a.condominio_id=condominio.id and a.carteira_id=pedido.carteira_id and a.status not in ('cancelado','renegociado','quebrado','suspenso') for update;
          select * into strict parcela from public.parcelas_acordo where id=(item->>'id')::uuid and acordo_id=acordo.id
            and updated_at=(item->>'rev')::timestamptz and status<>'cancelada' for update;
          if coalesce(public.scanner_bbz_recibo_parcela(parcela.id),public.cobranca_recibo_arquivo(parcela.observacoes)) is distinct from item->>'recibo'
            and not (item->>'tipo'='repasse_creditado' and item->>'portal'='lello' and exists(select 1 from public.acordos_fontes_lello f
              where f.acordo_id=acordo.id and f.codigo_condominio=p_codigo and f.numero_acordo=item->>'numero' and f.unidade_id=unidade.id)) then
            raise exception 'Recibo da parcela exige conferência.';
          end if;
          if item->>'tipo'='parcela_paga_extrato' then
            if parcela.data_pagamento is not null or parcela.status='paga' or parcela.vencimento<>(item->>'vencimento')::date
              or round(parcela.valor*100)<>(item->>'valorPago')::numeric or (item->>'dataPagamento')::date>hoje then
              raise exception 'A parcela mudou depois da consulta.';
            end if;
            alvo := parcela.id;
            antes := jsonb_build_object('status',parcela.status,'pagamento',parcela.data_pagamento,'valor',parcela.valor);
            update public.parcelas_acordo set status='paga',data_pagamento=(item->>'dataPagamento')::date where id=parcela.id;
            if not exists(select 1 from public.parcelas_acordo where acordo_id=acordo.id and status not in ('paga','cancelada')) then
              update public.acordos set status='quitado',status_financeiro='quitado',ultima_sincronizacao_status_em=now(),
                data_quitacao=(select max(data_pagamento) from public.parcelas_acordo where acordo_id=acordo.id and status='paga') where id=acordo.id;
            else
              update public.acordos set status_financeiro='parcial',ultima_sincronizacao_status_em=now() where id=acordo.id and status<>'quitado';
            end if;
          else
            if acordo.origem_controle<>'carteira' or parcela.status<>'paga' or parcela.data_pagamento is null
              or (item->>'dataCredito')::date not between parcela.data_pagamento and hoje or (item->>'centavos')::bigint<=0
              or coalesce(item->>'referencia','') !~ '^[A-Za-z0-9./_-]{3,100}$'
              or (coalesce(item->>'fonte','') !~ '^https://(portal\.lellocondominios\.com\.br|atentum-s9\.webware\.com\.br|servc9\.webware\.com\.br)/'
                and (pedido.demonstrativo_repasses is null or item->>'fonte' is distinct from 'arquivo:'||(pedido.demonstrativo_repasses->>'sha256')
                  or not exists(select 1 from jsonb_array_elements(pedido.demonstrativo_repasses->'repasses') r where r->>'recibo'=item->>'recibo'
                    and r->>'referencia'=item->>'referencia' and r->>'dataCredito'=item->>'dataCredito' and r->>'centavos'=item->>'centavos'))) then
              raise exception 'Crédito sem evidência suficiente.';
            end if;
            alvo := parcela.id;
            insert into public.easy_espelhamento_repasses(parcela_id,espelhamento_id,acordo_id,carteira_id,condominio_id,recibo,referencia,portal,fonte,data_credito,valor_centavos)
              values(parcela.id,pedido.id,acordo.id,pedido.carteira_id,condominio.id,item->>'recibo',item->>'referencia',lower(item->>'portal'),item->>'fonte',
                (item->>'dataCredito')::date,(item->>'centavos')::bigint);
          end if;
        when 'parcela_paga' then$s$);
  def := replace(def,$s$when item->>'tipo'='parcela_paga' then 'parcela_acordo'$s$,
    $s$when item->>'tipo' in ('parcela_paga','parcela_paga_extrato','repasse_creditado') then 'parcela_acordo'$s$);
  def := replace(def,$s$'espelhamento_lello',operacao <> 'em_cobranca_ativa'$s$,$s$case when p_codigo like 'receita:%' then 'espelhamento_administradora' else 'espelhamento_lello' end,operacao <> 'em_cobranca_ativa'$s$);
  def := replace(def,$s$alvo,'easy_espelhamento_lello','Espelhamento da administradora'$s$,
    $s$alvo,case when p_codigo like 'receita:%' then 'easy_espelhamento_administradora' else 'easy_espelhamento_lello' end,'Espelhamento da administradora'$s$);
  execute def;
end;
$$;

notify pgrst,'reload schema';
commit;
