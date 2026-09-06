-- A coluna provider passou a identificar também integrações oficiais externas.
-- A restrição legada aceitava apenas os provedores antigos e impedia o
-- dispatcher do WhatsApp de registrar tanto sucessos quanto falhas.
alter table if exists public.mensagens
  drop constraint if exists mensagens_provider_check;
