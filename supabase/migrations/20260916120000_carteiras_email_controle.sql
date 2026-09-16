alter table public.carteiras
  add column if not exists email_controle text;

comment on column public.carteiras.email_controle is
  'E-mail opcional que recebe cópia oculta dos e-mails enviados pelos Flows da carteira.';
