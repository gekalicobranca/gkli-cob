-- Preserve operational history when an import replaces its original debt.
alter table public.saneamento_cobrancas
 drop constraint saneamento_cobrancas_cobranca_id_fkey,
 add constraint saneamento_cobrancas_cobranca_id_fkey
 foreign key (cobranca_id) references public.cobrancas(id) on delete set null;
