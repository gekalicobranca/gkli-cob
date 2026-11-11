begin;
do $migration$
declare src text; ancora text:='new.status:=''em_tratamento''; new.descricao:=tarefa;';
begin
 src:=pg_get_functiondef('public.agentes_aprendizado_proteger_caso()'::regprocedure);
 if position(ancora in src)=0 then raise exception 'Âncora de atribuição ausente'; end if;
 execute replace(src,ancora,'new.responsavel_id:=operador; '||ancora);
end $migration$;
drop trigger zz_agentes_aprendizado_proteger_caso on public.central_pendencias;
create trigger zz_agentes_aprendizado_proteger_caso before insert or update of payload,status,unidade_id,responsavel_id on public.central_pendencias
 for each row when(new.tipo in ('keila_atendimento','lidia_atendimento')) execute function public.agentes_aprendizado_proteger_caso();
update public.central_pendencias c set payload=c.payload,updated_at=now()
 where c.tipo in ('keila_atendimento','lidia_atendimento') and c.status not in ('resolvida','cancelada')
 and jsonb_array_length(public.agentes_aprendizado_acordos(c))>0;
notify pgrst,'reload schema';
commit;

