begin;
-- This table is service-role only. Pairing material must never be exposed by
-- public PostgREST policies; the app reads it only after requireAdmin().
alter table public.whatsapp_worker_controles
  add column vinculacao_modo text check (vinculacao_modo in ('qr','codigo')),
  add column vinculacao_pedido uuid,
  add column vinculacao_payload text,
  add column vinculacao_expira_em timestamptz;
alter table public.whatsapp_worker_controles enable row level security;
revoke all on public.whatsapp_worker_controles from anon, authenticated;
commit;
