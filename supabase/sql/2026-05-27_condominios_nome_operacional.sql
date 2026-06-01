-- GKLI Cobrança — Nome operacional em condomínios
-- Aplica o campo operacional ao cadastro de condomínios sem alterar a chave/razão oficial.

create extension if not exists pg_trgm with schema public;

alter table public.condominios
  add column if not exists nome_operacional text;

update public.condominios
set nome_operacional = nome
where nome_operacional is null
  and nome is not null;

create index if not exists condominios_nome_operacional_idx
  on public.condominios using btree (nome_operacional);

create index if not exists condominios_nome_operacional_trgm_idx
  on public.condominios using gin (nome_operacional gin_trgm_ops)
  where nome_operacional is not null;
