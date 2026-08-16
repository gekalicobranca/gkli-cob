create table public.agente_workers (
  script_key text primary key,
  ultimo_sinal_em timestamptz not null default now(),
  versao text,
  metadata_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.agente_workers is
  'Sinal de vida dos workers externos que processam a fila do agente automatico.';

alter table public.agente_workers enable row level security;

create policy agente_workers_authenticated_select
  on public.agente_workers
  for select
  to authenticated
  using (true);

revoke all on table public.agente_workers from anon;
grant select on table public.agente_workers to authenticated;
