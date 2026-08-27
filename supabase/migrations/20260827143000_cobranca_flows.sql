create table if not exists public.cobranca_flows (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid null references public.carteiras(id) on delete set null,
  lote_id uuid not null references public.lotes(id) on delete cascade,
  regua_id uuid not null references public.reguas(id) on delete restrict,
  nome text not null,
  status text not null default 'pronto'
    check (status in ('pronto','em_execucao','pausado','cancelado','concluido','concluido_com_falhas')),
  total_mensagens integer not null default 0,
  total_pendentes integer not null default 0,
  total_agendadas integer not null default 0,
  total_enviadas integer not null default 0,
  total_falhas integer not null default 0,
  proximo_disparo_em timestamptz null,
  iniciado_em timestamptz null,
  pausado_em timestamptz null,
  cancelado_em timestamptz null,
  concluido_em timestamptz null,
  criado_por uuid null,
  atualizado_por uuid null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_cobranca_flows_lote
  on public.cobranca_flows(lote_id);

create index if not exists idx_cobranca_flows_status
  on public.cobranca_flows(status, proximo_disparo_em);

create index if not exists idx_cobranca_flows_carteira
  on public.cobranca_flows(carteira_id, created_at desc);

alter table public.mensagens
  add column if not exists cobranca_flow_id uuid null references public.cobranca_flows(id) on delete set null;

alter table public.lote_itens
  add column if not exists cobranca_flow_id uuid null references public.cobranca_flows(id) on delete set null;

create index if not exists idx_mensagens_cobranca_flow
  on public.mensagens(cobranca_flow_id, status, agendada_para)
  where cobranca_flow_id is not null;

create index if not exists idx_lote_itens_cobranca_flow
  on public.lote_itens(cobranca_flow_id)
  where cobranca_flow_id is not null;

drop trigger if exists trg_cobranca_flows_updated_at on public.cobranca_flows;
create trigger trg_cobranca_flows_updated_at
before update on public.cobranca_flows
for each row execute function public.set_updated_at();

comment on table public.cobranca_flows is
  'Flows operacionais próprios da nova esteira de cobrança, separados do módulo Comunicação.';
