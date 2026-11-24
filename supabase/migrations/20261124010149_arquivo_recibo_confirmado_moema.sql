-- Preserva a validação dos hashes, o vínculo exato do manifesto e os campos financeiros.
do $migration$
declare
  original text := pg_get_functiondef('public.validar_arquivo_duplicidade()'::regprocedure);
  anterior text := 'and public.cobranca_recibo_arquivo(OLD.observacoes)=public.cobranca_recibo_arquivo(canonica.observacoes)';
  novo text := $sql$and (public.cobranca_recibo_arquivo(OLD.observacoes)=public.cobranca_recibo_arquivo(canonica.observacoes)
              or (canonica.condominio_id='e0c3e623-3b32-4499-b649-20564da4cb8f'
                and public.cobranca_recibo_arquivo(OLD.observacoes)=(regexp_match(canonica.observacoes,'^Recibo CODIGO-([0-9]+) \| Código \1;','i'))[1]
                and exists(select 1 from public.importacao_itens i
                  where i.importacao_id=OLD.importacao_id and i.valido
                    and i.payload->>'unidade_id'=canonica.unidade_id::text
                    and i.payload->>'condominio_id'=canonica.condominio_id::text
                    and i.payload->>'carteira_id'=canonica.carteira_id::text
                    and i.payload->>'vencimento'=canonica.vencimento::text
                    and (i.payload->>'valor_original')::numeric=canonica.valor_original
                    and public.cobranca_recibo_arquivo(i.payload->>'observacoes')=public.cobranca_recibo_arquivo(OLD.observacoes))))$sql$;
begin
  if strpos(original,novo)>0 then return; end if;
  if array_length(string_to_array(original,anterior),1)<>2 then
    raise exception 'Validação de arquivamento incompatível com a migração Moema Flat.';
  end if;
  execute replace(original,anterior,novo);
end $migration$;
