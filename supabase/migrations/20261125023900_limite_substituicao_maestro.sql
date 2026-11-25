-- A substituição é atômica, e a RPC é restrita ao backend.
-- O PostgREST aplica este limite à transação desta função.
alter function public.maestro_substituir_captacao(uuid,timestamptz,uuid[],jsonb,jsonb,jsonb,jsonb)
  set statement_timeout = '45s';

notify pgrst, 'reload schema';
