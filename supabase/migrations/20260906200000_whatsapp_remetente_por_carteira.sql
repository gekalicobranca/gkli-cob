-- Permite que cada carteira use a linha global da GEKALI ou um numero proprio.

alter table if exists public.carteiras
  add column if not exists whatsapp_remetente_modo text not null default 'global',
  add column if not exists whatsapp_numero_proprio text,
  add column if not exists whatsapp_phone_number_id text,
  add column if not exists whatsapp_waba_id text;

alter table if exists public.carteiras
  drop constraint if exists carteiras_whatsapp_remetente_modo_check;

alter table if exists public.carteiras
  add constraint carteiras_whatsapp_remetente_modo_check
  check (whatsapp_remetente_modo in ('global', 'proprio'));

alter table if exists public.mensagens
  add column if not exists provider_phone_number_id text;

create index if not exists idx_mensagens_provider_phone_recipient
  on public.mensagens(provider_phone_number_id, provider_recipient, created_at desc)
  where provider_phone_number_id is not null and provider_recipient is not null;

comment on column public.carteiras.whatsapp_remetente_modo is
  'global usa a linha GEKALI definida no ambiente; proprio usa o PHONE_NUMBER_ID cadastrado na carteira.';

comment on column public.mensagens.provider_phone_number_id is
  'Copia do PHONE_NUMBER_ID remetente usado no envio, preservada para auditoria e roteamento das respostas.';
