-- Sprint 6.1 - Fechamento mensal GKLI Cobrança
-- Conceito: período de apuração com datas definidas pelo gestor.
-- A apuração usa pagamentos confirmados de parcelas de acordo dentro do período.

create extension if not exists pgcrypto;

alter table if exists public.acordos add column if not exists operador_id uuid references public.profiles(id);
alter table if exists public.acordos add column if not exists created_by uuid references public.profiles(id);
alter table if exists public.acordos add column if not exists despesa_cobranca_percentual numeric(8,4) not null default 0;
alter table if exists public.acordos add column if not exists despesa_cobranca_valor numeric(14,2) not null default 0;
alter table if exists public.acordos add column if not exists comissao_percentual numeric(8,4) not null default 0;

create table if not exists public.fechamento_periodos (
  id uuid primary key default gen_random_uuid(),
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  data_abertura date not null,
  data_fechamento date not null,
  data_limite_conferencia date,
  data_fechamento_efetivo timestamptz,
  status text not null default 'rascunho' check (status in ('rascunho','aberto','em_conferencia','fechado','faturado','reaberto','cancelado')),
  observacoes text,
  total_pagamentos_confirmados numeric(14,2) not null default 0,
  total_base_cobranca numeric(14,2) not null default 0,
  total_despesas_cobranca numeric(14,2) not null default 0,
  total_comissoes numeric(14,2) not null default 0,
  total_faturamento_omie numeric(14,2) not null default 0,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fechamento_periodos_datas_chk check (data_fechamento >= data_abertura),
  constraint fechamento_periodos_competencia_unique unique (competencia)
);

create table if not exists public.fechamento_pagamentos (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references public.fechamento_periodos(id) on delete cascade,
  acordo_id uuid references public.acordos(id) on delete set null,
  parcela_id uuid references public.parcelas_acordo(id) on delete set null,
  cobranca_id uuid references public.cobrancas(id) on delete set null,
  condominio_id uuid references public.condominios(id) on delete set null,
  unidade_id uuid references public.unidades(id) on delete set null,
  carteira_id uuid references public.carteiras(id) on delete set null,
  operador_id uuid references public.profiles(id) on delete set null,
  data_pagamento date not null,
  valor_pago numeric(14,2) not null default 0,
  valor_base_cobranca numeric(14,2) not null default 0,
  percentual_despesa_cobranca numeric(8,4) not null default 0,
  valor_despesa_cobranca numeric(14,2) not null default 0,
  percentual_comissao numeric(8,4) not null default 0,
  valor_comissao numeric(14,2) not null default 0,
  origem text not null default 'parcela_acordo',
  divergencia boolean not null default false,
  observacoes text,
  created_at timestamptz not null default now(),
  unique (periodo_id, parcela_id)
);

create table if not exists public.fechamento_despesas (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references public.fechamento_periodos(id) on delete cascade,
  carteira_id uuid references public.carteiras(id) on delete set null,
  condominio_id uuid references public.condominios(id) on delete set null,
  valor_base numeric(14,2) not null default 0,
  percentual_despesa numeric(8,4) not null default 0,
  valor_despesa numeric(14,2) not null default 0,
  origem text not null default 'pagamentos_confirmados',
  created_at timestamptz not null default now(),
  unique (periodo_id, carteira_id, condominio_id, origem)
);

create table if not exists public.fechamento_comissoes (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references public.fechamento_periodos(id) on delete cascade,
  carteira_id uuid references public.carteiras(id) on delete set null,
  operador_id uuid references public.profiles(id) on delete set null,
  valor_base numeric(14,2) not null default 0,
  percentual_comissao numeric(8,4) not null default 0,
  valor_comissao numeric(14,2) not null default 0,
  origem text not null default 'pagamentos_confirmados',
  created_at timestamptz not null default now(),
  unique (periodo_id, carteira_id, operador_id, origem)
);

create table if not exists public.fechamento_faturamentos_omie (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references public.fechamento_periodos(id) on delete cascade,
  carteira_id uuid references public.carteiras(id) on delete set null,
  condominio_id uuid references public.condominios(id) on delete set null,
  tipo_faturamento text not null default 'repasse_cobranca_extrajudicial',
  valor_base numeric(14,2) not null default 0,
  valor_faturamento numeric(14,2) not null default 0,
  status text not null default 'pendente' check (status in ('pendente','gerado','faturado','cancelado')),
  omie_codigo_cliente text,
  omie_codigo_pedido text,
  observacoes text,
  created_at timestamptz not null default now(),
  unique (periodo_id, carteira_id, condominio_id, tipo_faturamento)
);

create table if not exists public.fechamento_auditoria (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid references public.fechamento_periodos(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  acao text not null,
  descricao text not null,
  dados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_fechamento_periodos_status on public.fechamento_periodos(status);
create index if not exists idx_fechamento_periodos_competencia on public.fechamento_periodos(competencia desc);
create index if not exists idx_fechamento_pagamentos_periodo on public.fechamento_pagamentos(periodo_id);
create index if not exists idx_fechamento_pagamentos_data on public.fechamento_pagamentos(data_pagamento);
create index if not exists idx_fechamento_despesas_periodo on public.fechamento_despesas(periodo_id);
create index if not exists idx_fechamento_comissoes_periodo on public.fechamento_comissoes(periodo_id);
create index if not exists idx_fechamento_faturamentos_periodo on public.fechamento_faturamentos_omie(periodo_id);
create index if not exists idx_fechamento_auditoria_periodo on public.fechamento_auditoria(periodo_id, created_at desc);

alter table public.fechamento_periodos enable row level security;
alter table public.fechamento_pagamentos enable row level security;
alter table public.fechamento_despesas enable row level security;
alter table public.fechamento_comissoes enable row level security;
alter table public.fechamento_faturamentos_omie enable row level security;
alter table public.fechamento_auditoria enable row level security;

-- Gestão apenas: admin/gestor. Mantém simples e compatível com profiles.role usado no app.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fechamento_periodos' and policyname = 'fechamento_gestores_all') then
    create policy fechamento_gestores_all on public.fechamento_periodos
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','gestor')))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','gestor')));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fechamento_pagamentos' and policyname = 'fechamento_pagamentos_gestores_all') then
    create policy fechamento_pagamentos_gestores_all on public.fechamento_pagamentos
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','gestor')))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','gestor')));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fechamento_despesas' and policyname = 'fechamento_despesas_gestores_all') then
    create policy fechamento_despesas_gestores_all on public.fechamento_despesas
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','gestor')))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','gestor')));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fechamento_comissoes' and policyname = 'fechamento_comissoes_gestores_all') then
    create policy fechamento_comissoes_gestores_all on public.fechamento_comissoes
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','gestor')))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','gestor')));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fechamento_faturamentos_omie' and policyname = 'fechamento_faturamentos_gestores_all') then
    create policy fechamento_faturamentos_gestores_all on public.fechamento_faturamentos_omie
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','gestor')))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','gestor')));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fechamento_auditoria' and policyname = 'fechamento_auditoria_gestores_all') then
    create policy fechamento_auditoria_gestores_all on public.fechamento_auditoria
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','gestor')))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','gestor')));
  end if;
end $$;

create or replace function public.apurar_fechamento_mensal(p_periodo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periodo public.fechamento_periodos%rowtype;
  v_status text;
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
    observacoes
  )
  select
    p_periodo_id,
    a.id,
    p.id,
    a.cobranca_id,
    a.condominio_id,
    a.unidade_id,
    a.carteira_id,
    coalesce(a.operador_id, a.created_by),
    p.data_pagamento::date,
    coalesce(p.valor, 0),
    coalesce(p.valor, 0),
    coalesce(a.despesa_cobranca_percentual, 0),
    case
      when coalesce(a.despesa_cobranca_valor, 0) > 0 and coalesce(a.valor_acordado, 0) > 0
        then round(coalesce(p.valor, 0) * (a.despesa_cobranca_valor / nullif(a.valor_acordado, 0)), 2)
      else round(coalesce(p.valor, 0) * coalesce(a.despesa_cobranca_percentual, 0) / 100, 2)
    end,
    coalesce(a.comissao_percentual, 0),
    round(coalesce(p.valor, 0) * coalesce(a.comissao_percentual, 0) / 100, 2),
    'parcela_acordo',
    false,
    'Pagamento confirmado no período de fechamento.'
  from public.parcelas_acordo p
  join public.acordos a on a.id = p.acordo_id
  where p.data_pagamento is not null
    and p.data_pagamento::date between v_periodo.data_abertura and v_periodo.data_fechamento
    and coalesce(p.status, '') in ('paga', 'pago', 'quitada', 'quitado');

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
    sum(valor_base_cobranca),
    case when sum(valor_base_cobranca) > 0 then round(sum(valor_despesa_cobranca) / sum(valor_base_cobranca) * 100, 4) else 0 end,
    sum(valor_despesa_cobranca),
    'pagamentos_confirmados'
  from public.fechamento_pagamentos
  where periodo_id = p_periodo_id
  group by periodo_id, carteira_id, condominio_id;

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
    sum(valor_base_cobranca),
    case when sum(valor_base_cobranca) > 0 then round(sum(valor_comissao) / sum(valor_base_cobranca) * 100, 4) else 0 end,
    sum(valor_comissao),
    'pagamentos_confirmados'
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
         total_comissoes = coalesce((select sum(valor_comissao) from public.fechamento_comissoes where periodo_id = p_periodo_id), 0),
         total_faturamento_omie = coalesce((select sum(valor_faturamento) from public.fechamento_faturamentos_omie where periodo_id = p_periodo_id), 0),
         updated_at = now()
   where fp.id = p_periodo_id;

  insert into public.fechamento_auditoria (periodo_id, user_id, acao, descricao, dados)
  values (
    p_periodo_id,
    auth.uid(),
    'apuracao_rpc',
    'Apuração recalculada a partir de pagamentos confirmados.',
    jsonb_build_object('data_abertura', v_periodo.data_abertura, 'data_fechamento', v_periodo.data_fechamento)
  );
end;
$$;

grant execute on function public.apurar_fechamento_mensal(uuid) to authenticated;

comment on table public.fechamento_periodos is 'Períodos mensais de apuração definidos pelo gestor para cobrança extrajudicial, Omie e comissões.';
comment on table public.fechamento_pagamentos is 'Snapshot dos pagamentos confirmados que entram em cada fechamento.';
comment on table public.fechamento_faturamentos_omie is 'Base para faturamento Omie do repasse de cobrança extrajudicial.';
