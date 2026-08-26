alter table public.pre_juridico_casos
  drop constraint if exists pre_juridico_casos_procuracao_status_check;

alter table public.pre_juridico_casos
  add constraint pre_juridico_casos_procuracao_status_check
  check (procuracao_status in ('pendente', 'gerada', 'enviada', 'assinada'));

comment on column public.pre_juridico_casos.procuracao_status is
  'Andamento da procuracao: pendente, gerada, enviada ou assinada.';
