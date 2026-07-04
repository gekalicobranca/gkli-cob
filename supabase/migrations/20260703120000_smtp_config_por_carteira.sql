alter table public.integracoes_smtp_config
  add column if not exists carteira_id uuid references public.carteiras(id) on delete cascade;

create index if not exists integracoes_smtp_config_carteira_idx
  on public.integracoes_smtp_config (carteira_id, ativo, atualizado_em desc);
