do $$
begin
  if to_regclass('public.cobrancas') is not null then
    alter table public.cobrancas
      drop constraint if exists cobrancas_status_operacional_check;

    alter table public.cobrancas
      add constraint cobrancas_status_operacional_check
      check (
        status_operacional is null
        or status_operacional in (
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
  end if;
end $$;
