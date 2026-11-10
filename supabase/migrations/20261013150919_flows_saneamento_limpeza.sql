create table public.flow_saneamento_dispensas (
  cobranca_id uuid not null references public.cobrancas(id) on delete cascade,
  canal text not null check (canal in ('email', 'whatsapp', 'manual')),
  dispensado_por uuid not null references auth.users(id),
  dispensado_em timestamptz not null default now(),
  primary key (cobranca_id, canal)
);

-- Somente ações no servidor, após validar perfil e carteira, acessam a tabela.
alter table public.flow_saneamento_dispensas enable row level security;
revoke all on public.flow_saneamento_dispensas from anon, authenticated;
grant all on public.flow_saneamento_dispensas to service_role;
