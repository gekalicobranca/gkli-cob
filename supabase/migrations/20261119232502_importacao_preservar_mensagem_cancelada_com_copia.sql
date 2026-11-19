-- A mesma proteção vale na substituição inicial e na limpeza final de ausentes.
do $migration$
declare
  rotina regprocedure;
  definicao text;
  filtro_cobrancas constant text := 'and not exists(select 1 from public.acordos a where a.cobranca_id=c.id)';
  filtro_payload constant text := 'and payload ? ''cobranca_ids'';';
begin
  foreach rotina in array array[
    'public.importacao_substituir_cobrancas_anteriores(uuid)'::regprocedure,
    'public.importacao_remover_cobrancas_ausentes(uuid)'::regprocedure
  ] loop
    definicao := pg_get_functiondef(rotina);
    if array_length(string_to_array(definicao, filtro_cobrancas), 1) <> 2
       or array_length(string_to_array(definicao, filtro_payload), 1) <> 2 then
      raise exception 'Definição inesperada da rotina %', rotina;
    end if;
    -- Preserva a FK direta: excluir o débito poderia apagar a mensagem em cascata.
    definicao := replace(definicao, filtro_cobrancas, $sql$and not exists (
      select 1 from public.mensagens historico
      where historico.cobranca_id=c.id and historico.status='cancelada'
        and public.mensagem_contem_cobranca_arquivada(historico)
    )
    $sql$ || filtro_cobrancas);
    -- Mensagens consolidadas podem misturar cópias arquivadas e débitos elegíveis.
    definicao := replace(definicao, filtro_payload, $sql$and payload ? 'cobranca_ids'
      and (m.status is distinct from 'cancelada' or not public.mensagem_contem_cobranca_arquivada(m));$sql$);
    execute definicao;
  end loop;
end
$migration$;
