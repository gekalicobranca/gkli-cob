set lock_timeout = '5s';
-- Trigger execution remains bound to the existing table triggers.
-- End users do not need EXECUTE on these functions or permission to create triggers.
revoke execute on function public.fiscal_core_ao_fechar() from public, anon, authenticated;
revoke execute on function public.fiscal_core_proteger_origem() from public, anon, authenticated;
revoke execute on function public.validar_operador_cadastro() from public, anon, authenticated;
