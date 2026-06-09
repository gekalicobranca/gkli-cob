-- Make analytical/API views respect the caller RLS policies instead of the view owner.
alter view if exists public.vw_cockpit_sindico_avancado_aging set (security_invoker = true);
alter view if exists public.vw_carteira_operacional_p43 set (security_invoker = true);
alter view if exists public.vw_mensageria_resumo_operacional set (security_invoker = true);
alter view if exists public.vw_cockpit_sindico_avancado set (security_invoker = true);
alter view if exists public.v_mensagens_templates_resolucao set (security_invoker = true);
alter view if exists public.vw_cockpit_inteligente set (security_invoker = true);
alter view if exists public.vw_mensageria_operacional set (security_invoker = true);
alter view if exists public.vw_bi_status set (security_invoker = true);
alter view if exists public.vw_cockpit_operacional_core set (security_invoker = true);
alter view if exists public.vw_regua_lotes_resumo set (security_invoker = true);
alter view if exists public.v_cobrancas_bloqueio_planilha_adm set (security_invoker = true);
alter view if exists public.vw_mensageria_fila_operacional set (security_invoker = true);
alter view if exists public.vw_cobrancas_financeiro set (security_invoker = true);
alter view if exists public.vw_bi_aging set (security_invoker = true);
alter view if exists public.vw_cobrancas_operacional set (security_invoker = true);
alter view if exists public.vw_mensageria_saneamento_p39 set (security_invoker = true);
alter view if exists public.vw_analytics_executivo_p45 set (security_invoker = true);
alter view if exists public.vw_portal_sindico_condominios set (security_invoker = true);
alter view if exists public.vw_bi_operacional set (security_invoker = true);
alter view if exists public.vw_funil_operacional_p42 set (security_invoker = true);
alter view if exists public.vw_dashboard_executivo_p41 set (security_invoker = true);
alter view if exists public.vw_portal_sindico_cobrancas set (security_invoker = true);
alter view if exists public.vw_cockpit_sindico_avancado_resumo set (security_invoker = true);
alter view if exists public.vw_bi_condominios set (security_invoker = true);
alter view if exists public.vw_portal_sindico_resumo set (security_invoker = true);
alter view if exists public.vw_cockpit_sindico_avancado_status set (security_invoker = true);
alter view if exists public.vw_cockpit_experimental set (security_invoker = true);

-- RLS helper functions must remain executable by authenticated users because
-- policies call them. They do not need anonymous RPC exposure.
revoke execute on function public.current_user_can_access_carteira(uuid) from anon;
revoke execute on function public.current_user_can_access_importacao(uuid) from anon;
revoke execute on function public.current_user_is_admin() from anon;

-- Administrative/maintenance SECURITY DEFINER functions should not be exposed
-- as anonymous or regular authenticated RPC endpoints.
revoke execute on function gkli_flex.confirmar_importacao(uuid) from anon, authenticated;
revoke execute on function public.gkli_backfill_mensagens_lote_itens_p39() from anon, authenticated;
revoke execute on function public.gkli_normalizar_status_mensageria_p39() from anon, authenticated;
revoke execute on function public.gkli_recalcular_lote_totais_p39(uuid) from anon, authenticated;
revoke execute on function public.gkli_recalcular_todos_lotes_p39() from anon, authenticated;
revoke execute on function public.gkli_registrar_evento_operacional(uuid, text, uuid, text, text, text, text, text, text, uuid, jsonb) from anon, authenticated;
revoke execute on function public.gkli_registrar_timeline_operacional(uuid, text, uuid, text, text, text, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, jsonb, timestamptz) from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.registrar_evento_operacional(uuid, uuid, public.tipo_evento_operacional, text, text, text, jsonb) from anon, authenticated;

-- This materialized view is not used directly by the app. Keep it available to
-- privileged/server-side access only.
revoke select on public.mv_fila_prioridade_ia from anon, authenticated;
