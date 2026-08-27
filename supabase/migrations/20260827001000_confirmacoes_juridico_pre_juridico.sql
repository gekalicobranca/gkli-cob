alter table public.pre_juridico_casos
  add column if not exists juridico_procuracao_assinada_confirmada boolean not null default false,
  add column if not exists juridico_registro_recebido boolean not null default false,
  add column if not exists juridico_laudo_enviado boolean not null default false,
  add column if not exists distribuicao_cnpj text null;

comment on column public.pre_juridico_casos.juridico_procuracao_assinada_confirmada is
  'Confirmação operacional do jurídico de que a procuração assinada foi validada.';
comment on column public.pre_juridico_casos.juridico_registro_recebido is
  'Confirmação operacional do jurídico de que o registro foi recebido.';
comment on column public.pre_juridico_casos.juridico_laudo_enviado is
  'Confirmação operacional do jurídico de que o laudo foi enviado.';
comment on column public.pre_juridico_casos.distribuicao_cnpj is
  'CNPJ informado para confirmar a distribuição e marcar a unidade com ação judicial.';

update public.pre_juridico_casos
set juridico_procuracao_assinada_confirmada = true
where etapa in ('confirmar_juridico', 'pronto_juridico', 'enviado_juridico', 'analise_juridica', 'pendencia_juridica', 'autorizado_ajuizamento', 'judicializado')
  and procuracao_status = 'assinada';
