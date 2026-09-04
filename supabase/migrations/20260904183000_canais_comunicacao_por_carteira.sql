alter table public.carteiras
  add column if not exists email_habilitado boolean not null default true,
  add column if not exists whatsapp_habilitado boolean not null default false;

comment on column public.carteiras.email_habilitado is
  'Permite que réguas da carteira gerem comunicações por e-mail.';

comment on column public.carteiras.whatsapp_habilitado is
  'Permite que réguas da carteira gerem comunicações pela WhatsApp Cloud API.';
