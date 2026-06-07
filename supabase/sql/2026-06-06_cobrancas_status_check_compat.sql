-- Compatibiliza a constraint legada de public.cobrancas.status.
-- ASCII-only para evitar erro de colagem/encoding no SQL Editor.
-- Use antes de recriar a RPC de acordo.

alter table public.cobrancas
  drop constraint if exists cobrancas_status_check;

alter table public.cobrancas
  add constraint cobrancas_status_check
  check (
    status is null
    or status in (
      'novo',
      'em_cobranca_ativa',
      'em_negociacao',
      'acordo_firmado',
      'acordo_efetivado',
      'judicializado',
      'suspenso',
      'aberto',
      'aberta',
      'em cobranca ativa',
      'em negociacao',
      'acordo firmado',
      'acordo efetivado'
    )
  ) not valid;
