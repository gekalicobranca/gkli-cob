-- Remove inherited PUBLIC execute grants from SECURITY DEFINER functions.
-- RLS helper functions are granted back only to authenticated users because
-- scoped policies depend on them.
revoke execute on function public.current_user_can_access_carteira(uuid) from public;
revoke execute on function public.current_user_can_access_importacao(uuid) from public;
revoke execute on function public.current_user_is_admin() from public;
grant execute on function public.current_user_can_access_carteira(uuid) to authenticated;
grant execute on function public.current_user_can_access_importacao(uuid) to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;

-- Maintenance/trigger functions should not be callable as public RPC endpoints.
revoke execute on function gkli_flex.confirmar_importacao(uuid) from public;
revoke execute on function public.gkli_backfill_mensagens_lote_itens_p39() from public;
revoke execute on function public.gkli_normalizar_status_mensageria_p39() from public;
revoke execute on function public.gkli_recalcular_lote_totais_p39(uuid) from public;
revoke execute on function public.gkli_recalcular_todos_lotes_p39() from public;
revoke execute on function public.gkli_registrar_evento_operacional(uuid, text, uuid, text, text, text, text, text, text, uuid, jsonb) from public;
revoke execute on function public.gkli_registrar_timeline_operacional(uuid, text, uuid, text, text, text, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, jsonb, timestamptz) from public;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.registrar_evento_operacional(uuid, uuid, public.tipo_evento_operacional, text, text, text, jsonb) from public;
