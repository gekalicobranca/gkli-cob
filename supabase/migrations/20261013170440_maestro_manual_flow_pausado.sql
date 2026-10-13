begin;
-- O disparo manual encerra na preparação; nunca entra na ativação automática.
do $$ declare src text; anchor text; begin
 src := pg_get_functiondef('public.maestro_flow_finalizar(uuid,uuid,text)'::regprocedure);
 anchor := 'case when total>0 then ''pronto'' when falhas>0 then ''concluido_com_falhas'' else ''concluido'' end';
 if position(anchor in src)=0 then raise exception 'Âncora da finalização do Maestro ausente'; end if;
 execute replace(src, anchor, 'case when total>0 then case when exists(select 1 from public.agente_execucoes e where e.id=j.execucao_id and e.origem=''maestro'') then ''pausado'' else ''pronto'' end when falhas>0 then ''concluido_com_falhas'' else ''concluido'' end');
end $$;
commit;
