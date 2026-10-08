begin;
-- Limite específico da limpeza, aplicado pelo PostgREST antes da chamada RPC.
alter function public.importacao_substituir_cobrancas_anteriores(uuid) set statement_timeout='60s';
notify pgrst,'reload schema';
commit;
