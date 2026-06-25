alter table if exists public.fechamento_pagamentos add column if not exists tipo_pagamento text;
alter table if exists public.fechamento_pagamentos add column if not exists valor_recuperado numeric(14,2) not null default 0;
alter table if exists public.fechamento_pagamentos add column if not exists valor_entrada numeric(14,2) not null default 0;
alter table if exists public.fechamento_pagamentos add column if not exists quantidade_parcelas integer not null default 0;
alter table if exists public.acordos add column if not exists quantidade_parcelas integer not null default 0;

create table if not exists public.fechamento_operadores (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references public.fechamento_periodos(id) on delete cascade,
  carteira_id uuid references public.carteiras(id) on delete set null,
  operador_id uuid references public.profiles(id) on delete set null,
  acordos_realizados integer not null default 0,
  acordos_a_vista integer not null default 0,
  acordos_parcelados integer not null default 0,
  valor_base_cobranca numeric(14,2) not null default 0,
  valor_recuperado numeric(14,2) not null default 0,
  valor_pago_entrada numeric(14,2) not null default 0,
  valor_despesa_a_vista numeric(14,2) not null default 0,
  valor_despesa_parcelado numeric(14,2) not null default 0,
  valor_despesa_total numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (periodo_id, carteira_id, operador_id)
);

create table if not exists public.fechamento_carteiras (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references public.fechamento_periodos(id) on delete cascade,
  carteira_id uuid references public.carteiras(id) on delete set null,
  acordos_realizados integer not null default 0,
  valor_base_cobranca numeric(14,2) not null default 0,
  valor_recuperado numeric(14,2) not null default 0,
  percentual_comissao numeric(8,4) not null default 0,
  valor_comissao numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (periodo_id, carteira_id)
);

create index if not exists idx_fechamento_operadores_periodo on public.fechamento_operadores(periodo_id);
create index if not exists idx_fechamento_carteiras_periodo on public.fechamento_carteiras(periodo_id);

alter table public.fechamento_operadores enable row level security;
alter table public.fechamento_carteiras enable row level security;

drop policy if exists fechamento_operadores_gestores_all on public.fechamento_operadores;
create policy fechamento_operadores_gestores_all on public.fechamento_operadores
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','gestor')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','gestor')));

drop policy if exists fechamento_carteiras_gestores_all on public.fechamento_carteiras;
create policy fechamento_carteiras_gestores_all on public.fechamento_carteiras
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','gestor')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','gestor')));

create or replace function public.apurar_fechamento_mensal(p_periodo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periodo public.fechamento_periodos%rowtype;
begin
  select * into v_periodo
    from public.fechamento_periodos
   where id = p_periodo_id
   for update;

  if not found then
    raise exception 'Período de fechamento não encontrado.';
  end if;

  if v_periodo.status in ('fechado', 'faturado', 'cancelado') then
    raise exception 'Período % não permite nova apuração.', v_periodo.status;
  end if;

  delete from public.fechamento_pagamentos where periodo_id = p_periodo_id;
  delete from public.fechamento_despesas where periodo_id = p_periodo_id;
  delete from public.fechamento_comissoes where periodo_id = p_periodo_id;
  delete from public.fechamento_faturamentos_omie where periodo_id = p_periodo_id;
  delete from public.fechamento_operadores where periodo_id = p_periodo_id;
  delete from public.fechamento_carteiras where periodo_id = p_periodo_id;

  insert into public.fechamento_pagamentos (
    periodo_id,
    acordo_id,
    parcela_id,
    cobranca_id,
    condominio_id,
    unidade_id,
    carteira_id,
    operador_id,
    data_pagamento,
    valor_pago,
    valor_base_cobranca,
    percentual_despesa_cobranca,
    valor_despesa_cobranca,
    percentual_comissao,
    valor_comissao,
    origem,
    divergencia,
    observacoes,
    tipo_pagamento,
    valor_recuperado,
    valor_entrada,
    quantidade_parcelas
  )
  with parcelas_pagas as (
    select
      p.*,
      row_number() over (
        partition by p.acordo_id
        order by p.data_pagamento::date asc, p.numero asc nulls last, p.created_at asc nulls last
      ) as rn
    from public.parcelas_acordo p
    where p.data_pagamento is not null
      and coalesce(p.status, '') in ('paga', 'pago', 'quitada', 'quitado', 'efetivado', 'efetivada')
  ),
  acordos_realizados as (
    select
      a.*,
      p.id as primeira_parcela_id,
      p.data_pagamento::date as primeira_data_pagamento,
      coalesce(p.valor, 0) as primeiro_valor_pago,
      coalesce(p.tipo_parcela, '') as primeiro_tipo_parcela,
      coalesce(a.quantidade_parcelas, (select count(*) from public.parcelas_acordo px where px.acordo_id = a.id), 0) as total_parcelas,
      coalesce((
        select sum(coalesce(ac.valor_atualizado_no_acordo, 0))
        from public.acordo_cobrancas ac
        where ac.acordo_id = a.id
      ), coalesce(a.valor_acordado, 0)) as valor_base_total
    from parcelas_pagas p
    join public.acordos a on a.id = p.acordo_id
    where p.rn = 1
      and p.data_pagamento::date between v_periodo.data_abertura and v_periodo.data_fechamento
  )
  select
    p_periodo_id,
    a.id,
    a.primeira_parcela_id,
    a.cobranca_id,
    a.condominio_id,
    a.unidade_id,
    a.carteira_id,
    coalesce(a.operador_id, a.created_by),
    a.primeira_data_pagamento,
    a.primeiro_valor_pago,
    a.valor_base_total,
    coalesce(a.despesa_cobranca_percentual, 0),
    case
      when coalesce(a.despesa_cobranca_valor, 0) > 0 then coalesce(a.despesa_cobranca_valor, 0)
      else round(coalesce(a.valor_acordado, 0) * coalesce(a.despesa_cobranca_percentual, 0) / 100, 2)
    end,
    coalesce(a.comissao_percentual, 0),
    round(coalesce(a.valor_acordado, 0) * coalesce(a.comissao_percentual, 0) / 100, 2),
    'acordo_realizado',
    false,
    'Acordo realizado no período pelo primeiro pagamento, entrada ou pagamento à vista.',
    case
      when coalesce(a.entrada, 0) >= coalesce(a.valor_acordado, 0) or coalesce(a.total_parcelas, 0) <= 1 then 'a_vista'
      else 'parcelado'
    end,
    coalesce(a.valor_acordado, 0),
    coalesce(a.entrada, a.primeiro_valor_pago, 0),
    coalesce(a.total_parcelas, 0)
  from acordos_realizados a;

  insert into public.fechamento_despesas (
    periodo_id,
    carteira_id,
    condominio_id,
    valor_base,
    percentual_despesa,
    valor_despesa,
    origem
  )
  select
    periodo_id,
    carteira_id,
    condominio_id,
    sum(valor_recuperado),
    case when sum(valor_recuperado) > 0 then round(sum(valor_despesa_cobranca) / sum(valor_recuperado) * 100, 4) else 0 end,
    sum(valor_despesa_cobranca),
    'acordos_realizados'
  from public.fechamento_pagamentos
  where periodo_id = p_periodo_id
  group by periodo_id, carteira_id, condominio_id;

  insert into public.fechamento_operadores (
    periodo_id,
    carteira_id,
    operador_id,
    acordos_realizados,
    acordos_a_vista,
    acordos_parcelados,
    valor_base_cobranca,
    valor_recuperado,
    valor_pago_entrada,
    valor_despesa_a_vista,
    valor_despesa_parcelado,
    valor_despesa_total
  )
  select
    periodo_id,
    carteira_id,
    operador_id,
    count(*),
    count(*) filter (where tipo_pagamento = 'a_vista'),
    count(*) filter (where tipo_pagamento = 'parcelado'),
    sum(valor_base_cobranca),
    sum(valor_recuperado),
    sum(valor_pago),
    sum(case when tipo_pagamento = 'a_vista' then valor_despesa_cobranca else 0 end),
    sum(case when tipo_pagamento = 'parcelado' then valor_despesa_cobranca else 0 end),
    sum(valor_despesa_cobranca)
  from public.fechamento_pagamentos
  where periodo_id = p_periodo_id
  group by periodo_id, carteira_id, operador_id;

  insert into public.fechamento_carteiras (
    periodo_id,
    carteira_id,
    acordos_realizados,
    valor_base_cobranca,
    valor_recuperado,
    percentual_comissao,
    valor_comissao
  )
  select
    periodo_id,
    carteira_id,
    count(*),
    sum(valor_base_cobranca),
    sum(valor_recuperado),
    case when sum(valor_recuperado) > 0 then round(sum(valor_comissao) / sum(valor_recuperado) * 100, 4) else 0 end,
    sum(valor_comissao)
  from public.fechamento_pagamentos
  where periodo_id = p_periodo_id
  group by periodo_id, carteira_id;

  insert into public.fechamento_comissoes (
    periodo_id,
    carteira_id,
    operador_id,
    valor_base,
    percentual_comissao,
    valor_comissao,
    origem
  )
  select
    periodo_id,
    carteira_id,
    operador_id,
    sum(valor_recuperado),
    case when sum(valor_recuperado) > 0 then round(sum(valor_comissao) / sum(valor_recuperado) * 100, 4) else 0 end,
    sum(valor_comissao),
    'acordos_realizados'
  from public.fechamento_pagamentos
  where periodo_id = p_periodo_id
  group by periodo_id, carteira_id, operador_id;

  insert into public.fechamento_faturamentos_omie (
    periodo_id,
    carteira_id,
    condominio_id,
    tipo_faturamento,
    valor_base,
    valor_faturamento,
    status,
    observacoes
  )
  select
    periodo_id,
    carteira_id,
    condominio_id,
    'repasse_cobranca_extrajudicial',
    valor_base,
    valor_despesa,
    'pendente',
    'Base para faturamento Omie gerada pelo fechamento mensal.'
  from public.fechamento_despesas
  where periodo_id = p_periodo_id
    and valor_despesa > 0;

  update public.fechamento_periodos fp
     set total_pagamentos_confirmados = coalesce((select sum(valor_pago) from public.fechamento_pagamentos where periodo_id = p_periodo_id), 0),
         total_base_cobranca = coalesce((select sum(valor_base_cobranca) from public.fechamento_pagamentos where periodo_id = p_periodo_id), 0),
         total_despesas_cobranca = coalesce((select sum(valor_despesa) from public.fechamento_despesas where periodo_id = p_periodo_id), 0),
         total_comissoes = coalesce((select sum(valor_comissao) from public.fechamento_carteiras where periodo_id = p_periodo_id), 0),
         total_faturamento_omie = coalesce((select sum(valor_faturamento) from public.fechamento_faturamentos_omie where periodo_id = p_periodo_id), 0),
         updated_at = now()
   where fp.id = p_periodo_id;

  insert into public.fechamento_auditoria (periodo_id, user_id, acao, descricao, dados)
  values (
    p_periodo_id,
    auth.uid(),
    'apuracao_rpc',
    'Apuração recalculada a partir dos acordos realizados no período.',
    jsonb_build_object('data_abertura', v_periodo.data_abertura, 'data_fechamento', v_periodo.data_fechamento)
  );
end;
$$;

grant execute on function public.apurar_fechamento_mensal(uuid) to authenticated;
