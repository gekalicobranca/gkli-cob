-- Integração oficial com a WhatsApp Business Cloud API.

alter table if exists public.regua_etapas
  add column if not exists whatsapp_template_nome text,
  add column if not exists whatsapp_template_idioma text not null default 'pt_BR',
  add column if not exists whatsapp_template_parametros text[] not null default '{}'::text[];

alter table if exists public.mensagens
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists provider_recipient text,
  add column if not exists provider_status text,
  add column if not exists provider_template_name text,
  add column if not exists provider_payload jsonb not null default '{}'::jsonb,
  add column if not exists provider_error_code text,
  add column if not exists provider_error_message text,
  add column if not exists provider_accepted_at timestamptz,
  add column if not exists provider_sent_at timestamptz,
  add column if not exists provider_delivered_at timestamptz,
  add column if not exists provider_read_at timestamptz,
  add column if not exists provider_failed_at timestamptz;

create unique index if not exists ux_mensagens_provider_message_id
  on public.mensagens(provider, provider_message_id)
  where provider is not null and provider_message_id is not null;

create index if not exists idx_mensagens_whatsapp_dispatch
  on public.mensagens(canal, status, agendada_para, proxima_tentativa_em)
  where canal = 'whatsapp';

create index if not exists idx_mensagens_provider_recipient
  on public.mensagens(provider_recipient, created_at desc)
  where provider_recipient is not null;

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_webhook_events_created
  on public.whatsapp_webhook_events(created_at desc);

create table if not exists public.whatsapp_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  phone_number_id text,
  from_number text not null,
  contact_name text,
  message_type text not null,
  message_text text,
  matched_mensagem_id uuid references public.mensagens(id) on delete set null,
  carteira_id uuid references public.carteiras(id) on delete set null,
  cobranca_id uuid references public.cobrancas(id) on delete set null,
  acordo_id uuid references public.acordos(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_inbound_from_created
  on public.whatsapp_inbound_messages(from_number, received_at desc);

alter table public.whatsapp_webhook_events enable row level security;
alter table public.whatsapp_inbound_messages enable row level security;

alter table if exists public.regua_jobs drop constraint if exists regua_jobs_tipo_check;
alter table if exists public.regua_jobs
  add constraint regua_jobs_tipo_check
  check (tipo in ('regua_cobranca', 'regua_acordo', 'regua_pre_juridico', 'whatsapp_dispatcher', 'scheduler'));
