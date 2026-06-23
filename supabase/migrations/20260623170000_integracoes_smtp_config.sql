create table if not exists public.integracoes_smtp_config (
  id uuid primary key default gen_random_uuid(),
  ativo boolean not null default false,
  host text,
  porta integer not null default 587,
  usuario text,
  senha text,
  remetente text,
  secure boolean not null default false,
  starttls boolean not null default true,
  ehlo_domain text not null default 'gkli.local',
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create index if not exists integracoes_smtp_config_ativo_idx
  on public.integracoes_smtp_config (ativo);
