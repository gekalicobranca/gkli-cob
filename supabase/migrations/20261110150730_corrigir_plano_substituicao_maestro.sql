begin;

do $migration$
declare
  definicao text := pg_get_functiondef(
    'public.maestro_substituir_captacao(uuid,timestamptz,uuid[],jsonb,jsonb,jsonb,jsonb)'::regprocedure
  );
  trecho_antigo constant text := $sql$jsonb_array_elements(coalesce(m.plano,'[]'::jsonb)) parte where parte ?| (ids::text[])$sql$;
  trecho_corrigido constant text := $sql$jsonb_array_elements(coalesce(m.plano,'[]'::jsonb)) as etapa(cobrancas) where etapa.cobrancas ?| (ids::text[])$sql$;
begin
  if position(trecho_antigo in definicao)=0 then
    raise exception 'A consulta de montagem do Maestro mudou. Revise a correção antes de aplicar.';
  end if;
  execute replace(definicao,trecho_antigo,trecho_corrigido);
end $migration$;

commit;
