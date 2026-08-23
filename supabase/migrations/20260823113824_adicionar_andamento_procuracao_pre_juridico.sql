alter table public.pre_juridico_casos
  add column procuracao_status text not null default 'pendente',
  add column procuracao_gerada_em timestamptz,
  add column procuracao_assinada_em timestamptz;

alter table public.pre_juridico_casos
  add constraint pre_juridico_casos_procuracao_status_check
  check (procuracao_status in ('pendente', 'gerada', 'assinada'));

comment on column public.pre_juridico_casos.procuracao_status is
  'Andamento da procuracao: pendente, gerada ou assinada.';
