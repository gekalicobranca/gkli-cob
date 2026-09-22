alter table public.integracoes_smtp_config add column if not exists auth_method text not null default 'password'
  check (auth_method in ('password', 'google_oauth'));
create table if not exists public.integracoes_smtp_google_tokens (
  config_id uuid primary key references public.integracoes_smtp_config(id) on delete cascade,
  refresh_token_encrypted text not null,
  email text not null,
  atualizado_em timestamptz not null default now()
);
alter table public.integracoes_smtp_google_tokens enable row level security;
revoke all on public.integracoes_smtp_google_tokens from anon, authenticated;
grant all on public.integracoes_smtp_google_tokens to service_role;
