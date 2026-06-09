-- Pin function search_path to avoid depending on caller/session settings.
alter function public.gkli_operacional_search_index_prepare() set search_path = public, extensions;
alter function public.gkli_busca_operacional(p_termo text, p_carteira_ids uuid[], p_limite integer) set search_path = public, extensions;
alter function public.set_updated_at() set search_path = public, extensions;
alter function public.normalize_status(value text) set search_path = public, extensions;
alter function public.registrar_evento_operacional(p_carteira_id uuid, p_cobranca_id uuid, p_tipo tipo_evento_operacional, p_estado_anterior text, p_estado_novo text, p_descricao text, p_payload jsonb) set search_path = public, extensions;
alter function public.validar_transicao_estado(p_estado_atual text, p_novo_estado text) set search_path = public, extensions;
alter function public.calcular_score_cobranca(p_dias_atraso integer, p_estado text) set search_path = public, extensions;
alter function public.classificar_cobranca_ia(p_score numeric, p_estado text, p_dias_atraso integer) set search_path = public, extensions;
alter function public.recomendar_acao_ia(p_classificacao text) set search_path = public, extensions;
alter function public.refresh_fila_prioridade_ia() set search_path = public, extensions;
alter function public.finalizar_lote_regua(p_lote_id uuid, p_status text, p_total_avaliadas integer, p_total_criadas integer, p_total_puladas integer, p_total_duplicadas integer, p_total_erros integer, p_resumo jsonb) set search_path = public, extensions;
alter function public.gerar_fingerprint_regua(p_cobranca_id uuid, p_regua_etapa_id uuid, p_canal text, p_referencia date) set search_path = public, extensions;
alter function public.aprovar_mensagem_operacional(p_mensagem_id uuid, p_user_id uuid) set search_path = public, extensions;
alter function public.cancelar_mensagem_operacional(p_mensagem_id uuid, p_motivo text, p_user_id uuid) set search_path = public, extensions;
alter function public.aprovar_lote_mensagens(p_lote_id uuid, p_user_id uuid) set search_path = public, extensions;
alter function public.cancelar_lote_mensagens(p_lote_id uuid, p_motivo text, p_user_id uuid) set search_path = public, extensions;
alter function public.gkli_set_prioridade_ordem_central_pendencias() set search_path = public, extensions;
alter function public.gkli_set_updated_at() set search_path = public, extensions;
alter function public.set_saneamento_cobrancas_updated_at() set search_path = public, extensions;
alter function public.bloquear_escrita_acordos_parcelas_legado() set search_path = public, extensions;

alter function gkli_flex.set_updated_at() set search_path = gkli_flex, public, extensions;
