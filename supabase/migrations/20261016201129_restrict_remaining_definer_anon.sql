set lock_timeout = '5s';
-- Session RPCs retain their existing internal authorization and authenticated/service access.
revoke execute on function public.apurar_fechamento_mensal(uuid) from public, anon;
revoke execute on function public.list_operadores_cadastro() from public, anon;
-- Existing condominium/wallet triggers and their function body are unchanged.
revoke execute on function public.validar_operador_cadastro() from public, anon;
