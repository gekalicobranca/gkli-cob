do $migration$
declare
  assinatura regprocedure;
  original text;
  trecho text := 'and exists(select 1 from public.importacao_itens i where i.importacao_id=p_importacao and i.valido';
  novo text := $sql$and not (c.condominio_id='e0c3e623-3b32-4499-b649-20564da4cb8f'
      and c.vencimento<((imp.created_at at time zone 'America/Sao_Paulo')::date - interval '5 years')::date
      and exists(select 1 from public.importacao_itens origem where origem.importacao_id=p_importacao
        and origem.payload->>'condominio_id'=c.condominio_id::text
        and origem.payload->>'observacoes' like '%Origem: Conversão de Relatório | Sistema: Moema Flat |%'))
    $sql$||trecho;
begin
  foreach assinatura in array array['public.importacao_remover_cobrancas_ausentes(uuid)'::regprocedure,'public.importacao_substituir_cobrancas_anteriores(uuid)'::regprocedure] loop
    original:=pg_get_functiondef(assinatura);
    if strpos(original,novo)>0 then continue; end if;
    if array_length(string_to_array(original,trecho),1)<>2 then raise exception 'Escopo de limpeza incompatível: %',assinatura; end if;
    execute replace(original,trecho,novo);
  end loop;
end $migration$;
