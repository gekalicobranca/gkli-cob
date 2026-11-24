-- A limpeza usa a mesma equivalência dos dois formatos históricos do Moema Flat.
do $migration$
declare
  original text := pg_get_functiondef('public.importacao_remover_cobrancas_ausentes(uuid)'::regprocedure);
  trecho text := 'and case when i.recibo is not null';
  novo text := $sql$and case when c.condominio_id='e0c3e623-3b32-4499-b649-20564da4cb8f'
        and i.recibo=coalesce(
          (regexp_match(c.observacoes,'^Recibo CODIGO-([0-9]+) \| Código \1;', 'i'))[1],
          (regexp_match(c.observacoes,'^Código ([0-9]+);[^\n]*\| Código fonte \1 \| Moema Flat:', 'i'))[1])
        then true
        when i.recibo is not null$sql$;
begin
  if strpos(original,novo)>0 then return; end if;
  if array_length(string_to_array(original,trecho),1)<>2 then
    raise exception 'Definição da limpeza incompatível com a migração de recibos Moema Flat.';
  end if;
  execute replace(original,trecho,novo);
end $migration$;
