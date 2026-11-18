-- Executar somente depois das três migrations, no alvo autorizado.
-- Verificação de catálogo/contratos; não libera, agenda ou reconcilia operações.
begin read only;
set local statement_timeout='30s';
do $$
declare nome text; assinatura text;
begin
  if public.easy_p0_contencao_versao()<>1 or public.easy_flow_p0c_versao()<>3 then raise exception 'P0_POS: versão de proteção incompatível.'; end if;
  foreach nome in array array['easy_flow_execucoes','easy_flow_partes','easy_flow_reservas','easy_flow_eventos','easy_captacao_resultados'] loop
    if not exists(select 1 from pg_class c where c.oid=to_regclass('public.'||nome) and c.relrowsecurity) then raise exception 'P0_POS: RLS ausente: %',nome; end if;
    if has_table_privilege('anon','public.'||nome,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','public.'||nome,'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'P0_POS: acesso público/autenticado indevido: %',nome;
    end if;
  end loop;
  foreach assinatura in array array[
    'public.easy_captacao_confirmar(uuid,uuid,text,text)',
    'public.easy_flow_iniciar(uuid,uuid,uuid,uuid,jsonb,jsonb,text,jsonb,text)',
    'public.easy_flow_montar(uuid,integer,uuid,jsonb)',
    'public.easy_flow_liberar(uuid,integer,uuid,text)',
    'public.easy_flow_reconciliar(uuid,uuid)','public.easy_flow_descartar(uuid,uuid)',
    'public.email_ativar_flow(uuid,text,uuid)'
  ] loop
    if to_regprocedure(assinatura) is null then raise exception 'P0_POS: RPC ausente: %',assinatura; end if;
    if not has_function_privilege('service_role',assinatura,'EXECUTE') or has_function_privilege('anon',assinatura,'EXECUTE') or has_function_privilege('authenticated',assinatura,'EXECUTE') then
      raise exception 'P0_POS: grants de função incompatíveis: %',assinatura;
    end if;
  end loop;
  if position('EASY_CAP_CONFIRMATION_PAUSED' in pg_get_functiondef('public.easy_preparar_captacao(uuid,text)'::regprocedure))=0 then
    raise exception 'P0_POS: rotina destrutiva antiga não está suspensa.';
  end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgname in ('easy_flow_mensagens_guard','easy_flow_itens_guard','easy_flow_ativacao_guard'))<>3 then
    raise exception 'P0_POS: guard de Flow ausente.';
  end if;
end $$;
select 'protecao_p0_instalada_sem_mutacao' as resultado;
rollback;
