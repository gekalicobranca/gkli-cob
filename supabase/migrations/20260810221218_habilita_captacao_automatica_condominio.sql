alter table public.condominios
  add column if not exists captacao_automatica_habilitada boolean not null default false;

comment on column public.condominios.captacao_automatica_habilitada is
  'Autoriza coleta e conversao automatizadas; a importacao permanece pendente de validacao humana.';
