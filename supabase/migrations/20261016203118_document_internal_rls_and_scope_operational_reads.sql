set lock_timeout = '5s';
-- Reviewed fixed inventory: abort rather than override concurrently added policies.
do $guard$
begin
 if exists(select 1 from pg_policy where polrelid in (
'colaborador_area.colaborador_vinculo'::regclass,
'colaborador_area.core_app_acessos'::regclass,
'colaborador_area.pagamento_mensal'::regclass,
'colaborador_area.recibo_mensal'::regclass,
'gkli_core.apps'::regclass,
'gkli_core.auditoria_eventos'::regclass,
'gkli_core.carteiras'::regclass,
'gkli_core.permissoes'::regclass,
'gkli_core.tipo_acesso_permissoes'::regclass,
'gkli_core.tipos_acesso'::regclass,
'gkli_core.usuario_apps'::regclass,
'gkli_core.usuario_carteiras'::regclass,
'gkli_core.usuarios'::regclass,
'gkli_flex.auditoria_eventos'::regclass,
'gkli_flex.categorias_financeiras'::regclass,
'gkli_flex.colaboradores'::regclass,
'gkli_flex.comissao_eventos'::regclass,
'gkli_flex.comissoes'::regclass,
'gkli_flex.competencias'::regclass,
'gkli_flex.core_carteira_escopos'::regclass,
'gkli_flex.extrato_lancamento_eventos'::regclass,
'gkli_flex.extrato_lancamentos'::regclass,
'gkli_flex.extratos'::regclass,
'gkli_flex.fechamento_bloqueios'::regclass,
'gkli_flex.fechamento_checklist'::regclass,
'gkli_flex.fechamento_reaberturas'::regclass,
'gkli_flex.fechamento_snapshots'::regclass,
'gkli_flex.fechamentos'::regclass,
'gkli_flex.gestao_indicadores'::regclass,
'gkli_flex.importacao_eventos'::regclass,
'gkli_flex.importacao_inconsistencias'::regclass,
'gkli_flex.importacao_preview_linhas'::regclass,
'gkli_flex.importacoes'::regclass,
'gkli_flex.orcamento_itens'::regclass,
'gkli_flex.orcamentos'::regclass,
'gkli_flex.pagamento_eventos'::regclass,
'gkli_flex.pagamentos'::regclass,
'gkli_flex.pagamentos_recorrentes'::regclass,
'gkli_flex.perfil_permissoes'::regclass,
'gkli_flex.perfis'::regclass,
'gkli_flex.permissoes'::regclass,
'gkli_flex.receitas'::regclass,
'gkli_flex.recibo_pagamento_itens'::regclass,
'gkli_flex.recibos_pagamento'::regclass,
'gkli_flex.regras_classificacao'::regclass,
'gkli_flex.relatorio_definicoes'::regclass,
'gkli_flex.relatorio_execucoes'::regclass,
'gkli_flex.times'::regclass,
'gkli_flex.tipos_comissao'::regclass,
'public.acordos_parcelas'::regclass,
'public.acordos_timeline'::regclass,
'public.administradora_contatos'::regclass,
'public.administradoras'::regclass,
'public.auditoria_operacional'::regclass,
'public.automacoes_execucoes'::regclass,
'public.cobranca_parcelas'::regclass,
'public.cobrancas_duplicidade_execucoes'::regclass,
'public.cobrancas_recibo_guard'::regclass,
'public.email_agenda'::regclass,
'public.email_tentativas'::regclass,
'public.flow_progressao'::regclass,
'public.flow_progressao_backfill'::regclass,
'public.flow_progressao_fontes'::regclass,
'public.flow_saneamento_dispensas'::regclass,
'public.flows_jobs_controle'::regclass,
'public.integracoes_smtp_google_tokens'::regclass,
'public.logs_operacionais'::regclass,
'public.logs_operacionais_adm'::regclass,
'public.lotes_administradora'::regclass,
'public.lotes_mensagens'::regclass,
'public.maestro_flow_ativacoes'::regclass,
'public.maestro_flow_controle'::regclass,
'public.maestro_flow_montagens'::regclass,
'public.mensagens_templates'::regclass,
'public.mensagens_templates_metricas'::regclass,
'public.mensageria_eventos'::regclass,
'public.operacional_search_index'::regclass,
'public.regua_etapas'::regclass,
'public.reguas'::regclass,
'public.saneamento_cobrancas'::regclass,
'public.solicitacoes_administradora'::regclass,
'public.templates_mensageria_adm'::regclass,
'public.thunderbird_dispositivos'::regclass,
'public.thunderbird_envios'::regclass,
'public.transicoes_estado'::regclass,
'public.whatsapp_inbound_messages'::regclass,
'public.whatsapp_web_envios'::regclass,
'public.whatsapp_web_sessoes'::regclass,
'public.whatsapp_webhook_events'::regclass,
'public.whatsapp_worker_controles'::regclass,
'public.workers_controles'::regclass
 )) then raise exception 'Reviewed table gained a policy; re-audit before applying'; end if;
end $guard$;
-- These tables already deny direct API access. Make that boundary explicit.
-- Restrictive policies cannot grant access. Existing owners/BYPASSRLS keep access.
create policy internal_api_deny on colaborador_area.colaborador_vinculo as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on colaborador_area.core_app_acessos as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on colaborador_area.pagamento_mensal as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on colaborador_area.recibo_mensal as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_core.apps as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_core.auditoria_eventos as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_core.carteiras as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_core.permissoes as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_core.tipo_acesso_permissoes as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_core.tipos_acesso as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_core.usuario_apps as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_core.usuario_carteiras as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_core.usuarios as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.auditoria_eventos as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.categorias_financeiras as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.colaboradores as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.comissao_eventos as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.comissoes as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.competencias as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.core_carteira_escopos as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.extrato_lancamento_eventos as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.extrato_lancamentos as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.extratos as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.fechamento_bloqueios as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.fechamento_checklist as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.fechamento_reaberturas as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.fechamento_snapshots as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.fechamentos as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.gestao_indicadores as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.importacao_eventos as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.importacao_inconsistencias as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.importacao_preview_linhas as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.importacoes as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.orcamento_itens as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.orcamentos as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.pagamento_eventos as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.pagamentos as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.pagamentos_recorrentes as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.perfil_permissoes as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.perfis as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.permissoes as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.receitas as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.recibo_pagamento_itens as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.recibos_pagamento as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.regras_classificacao as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.relatorio_definicoes as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.relatorio_execucoes as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.times as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on gkli_flex.tipos_comissao as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.acordos_parcelas as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.administradora_contatos as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.administradoras as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.auditoria_operacional as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.cobranca_parcelas as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.cobrancas_duplicidade_execucoes as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.cobrancas_recibo_guard as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.email_agenda as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.email_tentativas as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.flow_progressao as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.flow_progressao_backfill as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.flow_progressao_fontes as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.flow_saneamento_dispensas as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.flows_jobs_controle as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.integracoes_smtp_google_tokens as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.logs_operacionais as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.logs_operacionais_adm as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.lotes_administradora as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.lotes_mensagens as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.maestro_flow_ativacoes as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.maestro_flow_controle as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.maestro_flow_montagens as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.mensagens_templates_metricas as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.mensageria_eventos as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.operacional_search_index as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.saneamento_cobrancas as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.solicitacoes_administradora as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.templates_mensageria_adm as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.thunderbird_dispositivos as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.thunderbird_envios as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.transicoes_estado as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.whatsapp_inbound_messages as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.whatsapp_web_envios as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.whatsapp_web_sessoes as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.whatsapp_webhook_events as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.whatsapp_worker_controles as restrictive for all to anon, authenticated using (false) with check (false);
create policy internal_api_deny on public.workers_controles as restrictive for all to anon, authenticated using (false) with check (false);
-- Restore only confirmed internal session reads; writes remain default-denied.
create policy internal_scoped_select on public.acordos_timeline for select to authenticated using (
 exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('admin','gestor','operador','leitura')) and exists (select 1 from public.acordos a where a.id = acordos_timeline.acordo_id and public.current_user_can_access_carteira(a.carteira_id))
);
create policy internal_scoped_select on public.mensagens_templates for select to authenticated using (
 exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('admin','gestor','operador','leitura')) and (carteira_id is null or public.current_user_can_access_carteira(carteira_id))
);
create policy internal_scoped_select on public.reguas for select to authenticated using (
 exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('admin','gestor','operador','leitura')) and (carteira_id is null or public.current_user_can_access_carteira(carteira_id))
);
create policy internal_scoped_select on public.regua_etapas for select to authenticated using (
 exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('admin','gestor','operador','leitura')) and exists (select 1 from public.reguas r where r.id = regua_etapas.regua_id and (r.carteira_id is null or public.current_user_can_access_carteira(r.carteira_id)))
);
create policy internal_scoped_select on public.automacoes_execucoes for select to authenticated using (
 exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('admin','gestor','operador','leitura')) and exists (select 1 from public.automacoes a where a.id = automacoes_execucoes.automacao_id and public.current_user_can_access_carteira(a.carteira_id))
);
