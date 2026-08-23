alter table public.pre_juridico_casos
  alter column acordo_id drop not null;

create unique index pre_juridico_casos_cobranca_id_unique_idx
  on public.pre_juridico_casos (cobranca_id)
  where cobranca_id is not null;

alter table public.pre_juridico_casos
  add constraint pre_juridico_casos_origem_check
  check (acordo_id is not null or cobranca_id is not null);

comment on table public.pre_juridico_casos is
  'Acompanha cobrancas e casos legados de acordos desde o pre-juridico ate a judicializacao.';
