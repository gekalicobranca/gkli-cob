-- Cadastro de apoio para contatos/responsaveis por unidade.
--
-- A unidade operacional passa a nascer da inadimplencia (condominio + bloco + unidade).
-- Esta tabela enriquece a unidade/cobranca com responsavel, documento, telefone e e-mail
-- quando houver cadastro complementar disponivel.

create table if not exists public.responsaveis_unidades (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references public.carteiras(id) on delete cascade,
  condominio_id uuid not null references public.condominios(id) on delete cascade,
  unidade text not null,
  bloco text null,
  responsavel_nome text null,
  tipo_responsavel text not null default 'nao_informado',
  responsavel_documento text null,
  telefone text null,
  email text null,
  origem text not null default 'cadastro_apoio',
  ativo boolean not null default true,
  observacoes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists responsaveis_unidades_unq
  on public.responsaveis_unidades (
    condominio_id,
    lower(trim(coalesce(bloco, ''))),
    lower(trim(unidade)),
    tipo_responsavel
  );

create index if not exists responsaveis_unidades_carteira_idx
  on public.responsaveis_unidades (carteira_id);

create index if not exists responsaveis_unidades_condominio_idx
  on public.responsaveis_unidades (condominio_id);

alter table public.responsaveis_unidades enable row level security;

drop policy if exists responsaveis_unidades_carteira_scope_all on public.responsaveis_unidades;
create policy responsaveis_unidades_carteira_scope_all
  on public.responsaveis_unidades
  for all
  to authenticated
  using (public.current_user_can_access_carteira(carteira_id))
  with check (public.current_user_can_access_carteira(carteira_id));

-- Migra/copia os responsaveis ja cadastrados em unidades para o cadastro de apoio.
-- Nao remove as unidades existentes: apenas preserva os dados de contato em uma fonte auxiliar.
insert into public.responsaveis_unidades (
  carteira_id,
  condominio_id,
  unidade,
  bloco,
  responsavel_nome,
  tipo_responsavel,
  responsavel_documento,
  telefone,
  email,
  origem,
  ativo,
  observacoes
)
select
  u.carteira_id,
  u.condominio_id,
  u.identificacao,
  u.bloco,
  u.responsavel_nome,
  'nao_informado',
  u.responsavel_documento,
  u.telefone,
  u.email,
  'migrado_unidades',
  true,
  'Copiado automaticamente de public.unidades.'
from public.unidades u
where u.carteira_id is not null
  and u.condominio_id is not null
  and nullif(trim(u.identificacao), '') is not null
on conflict (condominio_id, lower(trim(coalesce(bloco, ''))), lower(trim(unidade)), tipo_responsavel)
do update set
  carteira_id = excluded.carteira_id,
  responsavel_nome = coalesce(nullif(trim(excluded.responsavel_nome), ''), public.responsaveis_unidades.responsavel_nome),
  responsavel_documento = coalesce(nullif(trim(excluded.responsavel_documento), ''), public.responsaveis_unidades.responsavel_documento),
  telefone = coalesce(nullif(trim(excluded.telefone), ''), public.responsaveis_unidades.telefone),
  email = coalesce(nullif(trim(excluded.email), ''), public.responsaveis_unidades.email),
  updated_at = now();
