-- Pin the search path used by pure CNPJ utility functions.
-- Both functions remain SECURITY INVOKER and retain their existing grants.
alter function public.normalizar_cnpj(text) set search_path = '';
alter function public.cnpj_valido(text) set search_path = '';
