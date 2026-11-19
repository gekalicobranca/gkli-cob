begin read only;
set local statement_timeout='30s';
do $$
declare assinatura text; tabela text;
begin
  if (select count(*) from supabase_migrations.schema_migrations where version in
    ('20261118205314','20261118211109','20261118220528','20261119204222','20261119205321','20261119205324','20261119205728','20261119205808')) <> 8
  then raise exception 'Histórico da entrega incompleto'; end if;
  foreach tabela in array array['acordo_cancelamentos','easy_maestro_pedidos'] loop
    if not exists(select 1 from pg_class where oid=to_regclass('public.'||tabela) and relrowsecurity)
      or has_table_privilege('anon','public.'||tabela,'SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated','public.'||tabela,'SELECT,INSERT,UPDATE,DELETE')
    then raise exception 'RLS ou acesso de tabela incompatível: %',tabela; end if;
  end loop;
  foreach assinatura in array array[
    'public.acordo_cancelar_formalizacao_atomico(uuid,uuid,uuid,text,text,text,text)',
    'public.acordo_cancelamento_resultado(uuid,uuid,uuid)',
    'public.easy_maestro_captar_confirmado(uuid,text,uuid,boolean,uuid[],text,boolean)',
    'public.easy_flow_admin_reconciliar(uuid,uuid,text,text,uuid)',
    'public.easy_workers_saude(uuid,text,text,integer)'] loop
    if not has_function_privilege('service_role',assinatura,'EXECUTE')
      or has_function_privilege('anon',assinatura,'EXECUTE')
      or has_function_privilege('authenticated',assinatura,'EXECUTE')
    then raise exception 'Acesso de função incompatível: %',assinatura; end if;
  end loop;
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled in ('O','A')
    and tgname in ('acordo_cancelamento_pagamento_guard','easy_maestro_execucao_guard','easy_pague_conclusao'))<>3
  then raise exception 'Triggers P1 ausentes ou inativos'; end if;
end $$;
rollback;
