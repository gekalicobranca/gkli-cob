-- Parsers imutáveis de texto usados pela conciliação; nenhum acesso adicional ao usuário final.
grant execute on function public.cobranca_recibo_arquivo(text) to service_role;
grant execute on function public.cobranca_recibo_identidade(text) to service_role;
