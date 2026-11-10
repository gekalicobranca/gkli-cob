begin;
create table public.integracoes_smtp_rotas_condominio (
  condominio_id uuid primary key references public.condominios(id),
  carteira_id uuid not null references public.carteiras(id),
  smtp_config_id uuid not null references public.integracoes_smtp_config(id),
  remetente_email text not null check (remetente_email ~ '^[^[:space:]@<>;,]+@[^[:space:]@<>;,]+\.[^[:space:]@<>;,]+$'),
  responder_para text not null check (responder_para ~ '^[^[:space:]@<>;,]+@[^[:space:]@<>;,]+\.[^[:space:]@<>;,]+$'),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
comment on table public.integracoes_smtp_rotas_condominio is 'Roteamento administrativo de credenciais SMTP por condomínio para flows; nenhuma senha duplicada. Exclusivo do servidor.';
alter table public.integracoes_smtp_rotas_condominio enable row level security;
revoke all on public.integracoes_smtp_rotas_condominio from public,anon,authenticated;
grant select,insert,update,delete on public.integracoes_smtp_rotas_condominio to service_role;
create index integracoes_smtp_rotas_carteira_idx on public.integracoes_smtp_rotas_condominio(carteira_id);
create index integracoes_smtp_rotas_config_idx on public.integracoes_smtp_rotas_condominio(smtp_config_id);
notify pgrst,'reload schema';
commit;
