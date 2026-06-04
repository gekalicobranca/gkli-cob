-- GKLI Cobrança · Sprint Acordos 5.5
-- Formalização lite: termos, aceites, status de fluxo e boletos.

alter table if exists public.acordos
  add column if not exists fluxo_status text default 'rascunho',
  add column if not exists exige_aprovacao_sindico boolean not null default false,
  add column if not exists sindico_aprovado_em timestamptz,
  add column if not exists devedor_aceito_em timestamptz,
  add column if not exists boletos_solicitados_em timestamptz;

create table if not exists public.acordos_termos (
  id uuid primary key default gen_random_uuid(),
  acordo_id uuid not null references public.acordos(id) on delete cascade,
  carteira_id uuid,
  tipo_aceite text not null check (tipo_aceite in ('devedor', 'sindico')),
  status text not null default 'pendente' check (status in ('pendente', 'aceito', 'cancelado', 'expirado')),
  token text not null unique,
  titulo text not null,
  corpo text not null,
  destinatario_nome text,
  destinatario_email text,
  destinatario_documento text,
  aceite_ip text,
  aceite_user_agent text,
  aceito_em timestamptz,
  expira_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists acordos_termos_acordo_idx on public.acordos_termos(acordo_id);
create index if not exists acordos_termos_token_idx on public.acordos_termos(token);

create table if not exists public.acordos_aceites (
  id uuid primary key default gen_random_uuid(),
  acordo_id uuid not null references public.acordos(id) on delete cascade,
  termo_id uuid references public.acordos_termos(id) on delete set null,
  carteira_id uuid,
  tipo_aceite text not null check (tipo_aceite in ('devedor', 'sindico')),
  nome text not null,
  documento text,
  ip text,
  user_agent text,
  criado_em timestamptz not null default now()
);

create index if not exists acordos_aceites_acordo_idx on public.acordos_aceites(acordo_id);
create index if not exists acordos_aceites_termo_idx on public.acordos_aceites(termo_id);
