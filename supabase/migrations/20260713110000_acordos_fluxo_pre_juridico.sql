do $$
begin
  if to_regclass('public.acordos') is not null then
    alter table public.acordos
      drop constraint if exists acordos_fluxo_status_chk;

    alter table public.acordos
      add constraint acordos_fluxo_status_chk
      check (
        fluxo_status is null
        or fluxo_status in (
          'rascunho',
          'aguardando_aprovacao_sindico',
          'aprovado_sindico_aguardando_aceite_devedor',
          'aguardando_aceite_devedor',
          'aceito_aguardando_boletos',
          'boletos_solicitados',
          'boletos_recebidos',
          'boletos_enviados',
          'acordo_efetivado',
          'reaberto_reemissao',
          'reemissao_ajuste_registrado',
          'reemissao_boleto_solicitado',
          'reemissao_boleto_enviado',
          'cancelado',
          'reprovado_sindico',
          'rompido_retomar_cobranca',
          'rompido_suspender',
          'rompido_pre_juridico',
          'rompido_judicializar'
        )
      ) not valid;
  end if;
end $$;
