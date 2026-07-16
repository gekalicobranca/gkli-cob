do $$
begin
  if to_regclass('public.cobrancas') is not null then
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
          'possivel_acordo',
          'acordo_firmado',
          'acordo_efetivado',
          'pre_juridico',
          'judicializado',
          'suspenso',
          'aberto',
          'aberta',
          'em cobranca ativa',
          'em negociacao',
          'possivel acordo',
          'acordo firmado',
          'acordo efetivado',
          'pre juridico'
        )
      ) not valid;

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
          'possivel_acordo',
          'acordo_firmado',
          'acordo_efetivado',
          'pre_juridico',
          'judicializado',
          'suspenso',
          'aberto',
          'aberta',
          'em cobranca ativa',
          'em negociacao',
          'possivel acordo',
          'acordo firmado',
          'acordo efetivado',
          'pre juridico'
        )
      ) not valid;
  end if;
end $$;

update public.cobrancas c
set
  status = 'possivel_acordo',
  status_operacional = 'possivel_acordo'
where c.observacoes ilike '%Marcador origem: AE%'
  and coalesce(c.status_operacional, c.status, 'novo') in ('novo', 'aberto', 'aberta')
  and not exists (
    select 1
    from public.acordos a
    where a.unidade_id = c.unidade_id
      and a.status in ('ativo', 'em_dia', 'em_atraso')
  );
