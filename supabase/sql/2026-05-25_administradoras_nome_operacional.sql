-- GKLI Cobrança | Administradoras: nome operacional
-- Execute no Supabase SQL Editor antes de usar o novo campo no app.

alter table public.administradoras
  add column if not exists nome_operacional text;

update public.administradoras
set nome_operacional = nome
where nome_operacional is null
  and nome is not null;

create index if not exists administradoras_nome_operacional_idx
  on public.administradoras using btree (nome_operacional);
