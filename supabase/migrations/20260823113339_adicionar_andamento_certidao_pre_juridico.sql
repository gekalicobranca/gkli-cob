alter table public.pre_juridico_casos
  add column certidao_status text not null default 'pendente',
  add column certidao_solicitada_em timestamptz,
  add column certidao_recebida_em timestamptz;

alter table public.pre_juridico_casos
  add constraint pre_juridico_casos_certidao_status_check
  check (certidao_status in ('pendente', 'solicitada', 'recebida'));

comment on column public.pre_juridico_casos.certidao_status is
  'Andamento da certidao usada para confirmar a propriedade: pendente, solicitada ou recebida.';
