-- GKLI Cobrança — Régua por condomínio
-- Cada condomínio define em quantos dias após o vencimento a cobrança passa a ficar elegível para a régua.

alter table public.condominios
  add column if not exists inicio_cobranca_dias integer not null default 30;

alter table public.condominios
  add constraint condominios_inicio_cobranca_dias_check
  check (inicio_cobranca_dias >= 0 and inicio_cobranca_dias <= 365)
  not valid;

alter table public.condominios
  validate constraint condominios_inicio_cobranca_dias_check;

comment on column public.condominios.inicio_cobranca_dias is
  'Quantidade de dias após o vencimento para uma cobrança deste condomínio entrar na régua operacional.';

create index if not exists condominios_inicio_cobranca_dias_idx
  on public.condominios (inicio_cobranca_dias);
