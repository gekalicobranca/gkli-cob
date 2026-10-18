-- Amplia apenas o escopo autorizado da Lídia. Não ativa operação virtual,
-- agendas, envios, flows ou baixas. Preserva Oasis e as validações financeiras.
do $$
declare
  func record;
  definicao text;
  anterior text;
  nova text;
  alteradas integer := 0;
begin
  if not exists(select 1 from public.condominios
    where id='47926d7c-030b-4469-8713-b23eda558a56'::uuid
      and carteira_id='06827218-e2b1-4267-ad8f-81a0ab222cad'::uuid) then
    raise exception 'Cádiz não está na carteira Genske esperada.';
  end if;
  for func in select oid,proname from pg_proc where pronamespace='public'::regnamespace
    and proname in ('agente_virtual_negociar_acordo','agente_virtual_efetivar_acordo')
  loop
    definicao := pg_get_functiondef(func.oid);
    anterior := case when func.proname='agente_virtual_negociar_acordo' then 'caso' else 'c' end;
    anterior := anterior || '.condominio_id is distinct from ''2fef8e0b-664e-4aad-b7af-1d702c586065''::uuid';
    nova := case when func.proname='agente_virtual_negociar_acordo' then 'caso' else 'c' end;
    -- COALESCE mantém rejeição de condomínio nulo (NOT IN isolado permitiria NULL).
    nova := 'coalesce(' || nova || '.condominio_id in (''2fef8e0b-664e-4aad-b7af-1d702c586065''::uuid,''47926d7c-030b-4469-8713-b23eda558a56''::uuid),false) is not true';
    if position(anterior in definicao)=0 then
      raise exception 'Restrição esperada não encontrada em %. Revisar antes de aplicar.',func.proname;
    end if;
    execute replace(definicao,anterior,nova);
    alteradas := alteradas+1;
  end loop;
  if alteradas<>2 then raise exception 'Esperadas duas funções do agente virtual.'; end if;
end $$;
notify pgrst,'reload schema';
