-- Preserve the existing OR semantics while removing overlapping permissive policies.
SET lock_timeout = '5s';

DROP POLICY captacao_historica_sindico_admin_all ON public.captacao_historica_sindico;
CREATE POLICY captacao_historica_sindico_admin_insert ON public.captacao_historica_sindico FOR INSERT TO authenticated WITH CHECK (public.current_user_is_admin());
CREATE POLICY captacao_historica_sindico_admin_update ON public.captacao_historica_sindico FOR UPDATE TO authenticated USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE POLICY captacao_historica_sindico_admin_delete ON public.captacao_historica_sindico FOR DELETE TO authenticated USING (public.current_user_is_admin());

DROP POLICY portal_sindico_condominios_admin_all ON public.portal_sindico_condominios;
CREATE POLICY portal_sindico_condominios_admin_insert ON public.portal_sindico_condominios FOR INSERT TO authenticated WITH CHECK (public.current_user_is_admin());
CREATE POLICY portal_sindico_condominios_admin_update ON public.portal_sindico_condominios FOR UPDATE TO authenticated USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE POLICY portal_sindico_condominios_admin_delete ON public.portal_sindico_condominios FOR DELETE TO authenticated USING (public.current_user_is_admin());

DROP POLICY portal_sindico_usuarios_admin_all ON public.portal_sindico_usuarios;
CREATE POLICY portal_sindico_usuarios_admin_insert ON public.portal_sindico_usuarios FOR INSERT TO authenticated WITH CHECK (public.current_user_is_admin());
CREATE POLICY portal_sindico_usuarios_admin_update ON public.portal_sindico_usuarios FOR UPDATE TO authenticated USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE POLICY portal_sindico_usuarios_admin_delete ON public.portal_sindico_usuarios FOR DELETE TO authenticated USING (public.current_user_is_admin());

DROP POLICY portal_sindico_sessoes_admin_all ON public.portal_sindico_sessoes;
CREATE POLICY portal_sindico_sessoes_admin_select ON public.portal_sindico_sessoes FOR SELECT TO authenticated USING (public.current_user_is_admin());
CREATE POLICY portal_sindico_sessoes_admin_update ON public.portal_sindico_sessoes FOR UPDATE TO authenticated USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE POLICY portal_sindico_sessoes_admin_delete ON public.portal_sindico_sessoes FOR DELETE TO authenticated USING (public.current_user_is_admin());
ALTER POLICY portal_sindico_sessoes_insert_own ON public.portal_sindico_sessoes WITH CHECK (public.current_user_is_admin() OR user_id = (SELECT auth.uid()));
