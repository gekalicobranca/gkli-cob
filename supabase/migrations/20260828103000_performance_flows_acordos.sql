-- Índices focados nas telas de Flow e na listagem operacional de acordos.
-- Criados de forma idempotente para acelerar filtros, expansão de flows e paginação.

create index if not exists idx_lote_itens_cobranca_flow_created
  on public.lote_itens (cobranca_flow_id, created_at)
  where cobranca_flow_id is not null;

create index if not exists idx_lote_itens_acordo_flow_created
  on public.lote_itens (acordo_flow_id, created_at)
  where acordo_flow_id is not null;

create index if not exists idx_lote_itens_pre_juridico_flow_created
  on public.lote_itens (pre_juridico_flow_id, created_at)
  where pre_juridico_flow_id is not null;

create index if not exists idx_mensagens_cobranca_flow_status_agenda
  on public.mensagens (cobranca_flow_id, status, agendada_para)
  where cobranca_flow_id is not null;

create index if not exists idx_mensagens_acordo_flow_status_agenda
  on public.mensagens (acordo_flow_id, status, agendada_para)
  where acordo_flow_id is not null;

create index if not exists idx_mensagens_pre_juridico_flow_status_agenda
  on public.mensagens (pre_juridico_flow_id, status, agendada_para)
  where pre_juridico_flow_id is not null;

create index if not exists idx_cobrancas_status_operacional_vencimento
  on public.cobrancas (status_operacional, vencimento);

create index if not exists idx_cobrancas_status_vencimento
  on public.cobrancas (status, vencimento);

create index if not exists idx_acordos_carteira_data
  on public.acordos (carteira_id, data_acordo desc);

create index if not exists idx_acordos_carteira_status_data
  on public.acordos (carteira_id, status, data_acordo desc);

create index if not exists idx_acordos_condominio_data
  on public.acordos (condominio_id, data_acordo desc);

create index if not exists idx_acordos_unidade_data
  on public.acordos (unidade_id, data_acordo desc);

create index if not exists idx_parcelas_acordo_status_vencimento
  on public.parcelas_acordo (status, vencimento);

create index if not exists idx_parcelas_acordo_acordo_status_vencimento
  on public.parcelas_acordo (acordo_id, status, vencimento);
