-- Add pre_juridico as an intermediate operational status before judicial action.

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
      'pre_juridico',
      'judicializado',
      'suspenso',
      'aberto',
      'aberta',
      'em cobranca ativa',
      'em negociacao',
      'acordo firmado',
      'acordo efetivado',
      'pre juridico'
    )
  ) not valid;
