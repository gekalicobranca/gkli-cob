alter table if exists public.carteiras
  add column if not exists pre_juridico_habilitado boolean not null default false;

comment on column public.carteiras.pre_juridico_habilitado is
  'Controla se a carteira pode gerar documentos, lotes e mensagens de pre-juridico.';
