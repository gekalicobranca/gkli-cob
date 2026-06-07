-- Compatibiliza a constraint de public.acordos.fluxo_status com os fluxos usados pelo app.
-- Corrige erro ao confirmar "Boletos enviados" quando o banco ainda nao aceita
-- fluxo_status = 'boletos_enviados'.

alter table public.acordos
  drop constraint if exists acordos_fluxo_status_chk;

alter table public.acordos
  add constraint acordos_fluxo_status_chk
  check (
    fluxo_status in (
      'rascunho',
      'aguardando_aprovacao_sindico',
      'aprovado_sindico_aguardando_aceite_devedor',
      'aguardando_aceite_devedor',
      'aceito_aguardando_boletos',
      'boletos_solicitados',
      'boletos_recebidos',
      'boletos_enviados',
      'acordo_efetivado',
      'cancelado',
      'reprovado_sindico',
      'rompido_retomar_cobranca',
      'rompido_suspender',
      'rompido_judicializar'
    )
  ) not valid;
