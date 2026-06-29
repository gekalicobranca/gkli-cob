-- Portal do sindico: acesso separado do cockpit operacional.

do $$
declare
  constraint_name text;
begin
  select conname
    into constraint_name
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%role%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'gestor', 'operador', 'leitura', 'sindico'));

create table if not exists public.portal_sindico_usuarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  documento text,
  telefone text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo', 'pendente')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.portal_sindico_usuarios
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists nome text,
  add column if not exists email text,
  add column if not exists documento text,
  add column if not exists telefone text,
  add column if not exists status text not null default 'ativo',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.portal_sindico_condominios (
  id uuid primary key default gen_random_uuid(),
  portal_usuario_id uuid not null references public.portal_sindico_usuarios(id) on delete cascade,
  condominio_id uuid not null references public.condominios(id) on delete cascade,
  carteira_id uuid references public.carteiras(id),
  perfil text not null default 'sindico' check (perfil in ('sindico', 'conselheiro', 'leitura')),
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_at timestamptz not null default now(),
  unique (portal_usuario_id, condominio_id)
);

alter table public.portal_sindico_condominios
  add column if not exists portal_usuario_id uuid references public.portal_sindico_usuarios(id) on delete cascade,
  add column if not exists condominio_id uuid references public.condominios(id) on delete cascade,
  add column if not exists carteira_id uuid references public.carteiras(id),
  add column if not exists perfil text not null default 'sindico',
  add column if not exists status text not null default 'ativo',
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.portal_sindico_convites (
  id uuid primary key default gen_random_uuid(),
  portal_usuario_id uuid references public.portal_sindico_usuarios(id) on delete cascade,
  email text not null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pendente' check (status in ('pendente', 'usado', 'expirado', 'cancelado')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.portal_sindico_sessoes (
  id uuid primary key default gen_random_uuid(),
  portal_usuario_id uuid references public.portal_sindico_usuarios(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.portal_sindico_sessoes
  add column if not exists portal_usuario_id uuid references public.portal_sindico_usuarios(id) on delete cascade,
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists ip inet,
  add column if not exists user_agent text,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.portal_sindico_auditoria (
  id uuid primary key default gen_random_uuid(),
  portal_usuario_id uuid references public.portal_sindico_usuarios(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  acao text not null,
  entidade_tipo text,
  entidade_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_portal_sindico_usuarios_user_id
  on public.portal_sindico_usuarios(user_id);

create index if not exists idx_portal_sindico_usuarios_email
  on public.portal_sindico_usuarios(lower(email));

create index if not exists idx_portal_sindico_condominios_usuario
  on public.portal_sindico_condominios(portal_usuario_id);

create index if not exists idx_portal_sindico_condominios_condominio
  on public.portal_sindico_condominios(condominio_id);

alter table public.portal_sindico_usuarios enable row level security;
alter table public.portal_sindico_condominios enable row level security;
alter table public.portal_sindico_convites enable row level security;
alter table public.portal_sindico_sessoes enable row level security;
alter table public.portal_sindico_auditoria enable row level security;

drop policy if exists portal_sindico_usuarios_admin_select on public.portal_sindico_usuarios;
drop policy if exists portal_sindico_usuarios_admin_insert on public.portal_sindico_usuarios;
drop policy if exists portal_sindico_usuarios_select_own on public.portal_sindico_usuarios;
drop policy if exists portal_sindico_usuarios_admin_all on public.portal_sindico_usuarios;

create policy portal_sindico_usuarios_select_own
  on public.portal_sindico_usuarios
  for select
  to authenticated
  using (user_id = (select auth.uid()) or public.current_user_is_admin());

create policy portal_sindico_usuarios_admin_all
  on public.portal_sindico_usuarios
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists portal_sindico_condominios_admin_select on public.portal_sindico_condominios;
drop policy if exists portal_sindico_condominios_admin_insert on public.portal_sindico_condominios;
drop policy if exists portal_sindico_condominios_select_own on public.portal_sindico_condominios;
drop policy if exists portal_sindico_condominios_admin_all on public.portal_sindico_condominios;

create policy portal_sindico_condominios_select_own
  on public.portal_sindico_condominios
  for select
  to authenticated
  using (
    public.current_user_is_admin()
    or exists (
      select 1
      from public.portal_sindico_usuarios psu
      where psu.id = portal_sindico_condominios.portal_usuario_id
        and psu.user_id = (select auth.uid())
        and psu.status = 'ativo'
        and portal_sindico_condominios.status = 'ativo'
    )
  );

create policy portal_sindico_condominios_admin_all
  on public.portal_sindico_condominios
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists portal_sindico_convites_admin_all on public.portal_sindico_convites;
create policy portal_sindico_convites_admin_all
  on public.portal_sindico_convites
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists portal_sindico_sessoes_insert_own on public.portal_sindico_sessoes;
drop policy if exists portal_sindico_sessoes_admin_select on public.portal_sindico_sessoes;
drop policy if exists portal_sindico_sessoes_admin_insert on public.portal_sindico_sessoes;
drop policy if exists portal_sindico_sessoes_admin_all on public.portal_sindico_sessoes;

create policy portal_sindico_sessoes_insert_own
  on public.portal_sindico_sessoes
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy portal_sindico_sessoes_admin_all
  on public.portal_sindico_sessoes
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists portal_sindico_auditoria_insert_own on public.portal_sindico_auditoria;
drop policy if exists portal_sindico_auditoria_admin_select on public.portal_sindico_auditoria;

create policy portal_sindico_auditoria_insert_own
  on public.portal_sindico_auditoria
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy portal_sindico_auditoria_admin_select
  on public.portal_sindico_auditoria
  for select
  to authenticated
  using (public.current_user_is_admin());
