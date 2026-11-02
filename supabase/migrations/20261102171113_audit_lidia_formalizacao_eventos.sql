-- Item 4: única lista SQL de pares; não ativa agentes/envios nem altera limites.
begin;
create or replace function public.lidia_escopo_autorizado(p_condominio uuid, p_carteira uuid)
returns boolean language sql immutable security invoker set search_path='' as $$
 select coalesce((p_condominio,p_carteira) in (
 ('2fef8e0b-664e-4aad-b7af-1d702c586065'::uuid,'06827218-e2b1-4267-ad8f-81a0ab222cad'::uuid),
 ('47926d7c-030b-4469-8713-b23eda558a56'::uuid,'36b6c087-56d2-4297-be63-6dcbe02a9f00'::uuid)),false);
$$;
revoke all on function public.lidia_escopo_autorizado(uuid,uuid) from public,anon;
grant execute on function public.lidia_escopo_autorizado(uuid,uuid) to authenticated,service_role;

-- Preserva as funções vigentes, incluindo regras comerciais posteriores.
-- Âncora desconhecida aborta a transação em vez de sobrescrever regras.
do $migration$
declare src text; novo text; f text; alias text; assinatura text; prefixo text;
begin
 foreach f in array array['agente_virtual_negociar_acordo','agente_virtual_efetivar_acordo'] loop
  assinatura:=case when f='agente_virtual_negociar_acordo' then f||'(text,uuid,uuid,text,jsonb,text)' else f||'(uuid)' end;
  alias:=case when f='agente_virtual_negociar_acordo' then 'caso' else 'c' end;
  prefixo:=case when alias='caso' then 'if p_agente=''lidia'' and ' else 'if c.tipo=''lidia_atendimento'' and ' end;
  src:=pg_get_functiondef(('public.'||assinatura)::regprocedure);
  novo:=regexp_replace(src,prefixo||'.*?then raise exception ''Atendimento fora do piloto da Lidia.''; end if;',
   prefixo||'(public.lidia_escopo_autorizado('||alias||'.condominio_id,'||alias||'.carteira_id) is not true'
    ||' or not exists(select 1 from public.condominios d where d.id='||alias||'.condominio_id and d.carteira_id='||alias||'.carteira_id)'
    ||case when alias='c' then ' or a.condominio_id is distinct from c.condominio_id' else '' end
    ||') then raise exception ''Atendimento fora do piloto da Lidia.''; end if;');
  if novo=src then raise exception 'Âncora de escopo ausente: %',f; end if;
  execute novo;
 end loop;
 foreach f in array array['lidia_aviso_boletos_autorizado(public.mensagens)','lidia_preparar_aviso_boletos()'] loop
  src:=pg_get_functiondef(('public.'||f)::regprocedure);
  alias:=case when f like 'lidia_aviso%' then 'c' else 'new' end;
  novo:=regexp_replace(src,'\('||alias||'\.condominio_id,'||alias||'\.carteira_id\) (not )?in \(\s*\(''[0-9a-f-]+''::uuid,''[0-9a-f-]+''::uuid\),\s*\(''[0-9a-f-]+''::uuid,''[0-9a-f-]+''::uuid\)\)',
   'public.lidia_escopo_autorizado('||alias||'.condominio_id,'||alias||'.carteira_id)'||case when alias='new' then ' is not true' else ' is true' end);
  if novo=src then raise exception 'Âncora de aviso ausente: %',f; end if;
  execute novo;
 end loop;
 foreach f in array array['agente_virtual_formalizacao_humana()','agente_virtual_avisar_operador()','email_aviso_interno_autorizado(public.mensagens)'] loop
  src:=pg_get_functiondef(('public.'||f)::regprocedure);
  novo:=replace(src,'new.carteira_id=''06827218-e2b1-4267-ad8f-81a0ab222cad''::uuid','public.lidia_escopo_autorizado(new.condominio_id,new.carteira_id)');
  novo:=replace(novo,'c.carteira_id=''06827218-e2b1-4267-ad8f-81a0ab222cad''::uuid','public.lidia_escopo_autorizado(c.condominio_id,c.carteira_id)');
  if novo=src then raise exception 'Âncora de encaminhamento ausente: %',f; end if;
  execute novo;
 end loop;
end $migration$;
notify pgrst,'reload schema';
commit;
