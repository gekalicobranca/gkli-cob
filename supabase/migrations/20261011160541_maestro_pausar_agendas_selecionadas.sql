create or replace function public.maestro_pausar_agendas(p_condominio_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 ids uuid[]; pausadas integer; canceladas integer;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','gestor','operador')) then
   raise exception 'Sem permissão para pausar agendas.';
 end if;
 select array_agg(distinct id) into ids from unnest(p_condominio_ids) id;
 if coalesce(cardinality(ids),0)=0 or cardinality(ids)>1000 or array_position(ids,null) is not null then
   raise exception 'Selecione entre 1 e 1000 condomínios.';
 end if;
 if (select count(*) from public.condominios where id=any(ids)
   and public.current_user_can_access_carteira(carteira_id) is true)<>cardinality(ids) then
   raise exception 'Seleção contém condomínio inexistente ou sem permissão.';
 end if;
 perform 1 from public.condominios where id=any(ids) order by id for update;
 update public.condominios set captacao_automatica_habilitada=false,updated_at=now()
   where id=any(ids) and captacao_automatica_habilitada is true;
 get diagnostics pausadas = row_count;
 update public.agente_execucoes set status='cancelada',finalizado_em=now(),
   erro_mensagem='Agenda pausada por seleção no Maestro.'
   where condominio_id=any(ids) and status='pendente'
   and (origem in ('agenda_mensal','maestro_agendada','manual_agendada') or agendado_para is not null);
 get diagnostics canceladas = row_count;
 return jsonb_build_object('pausadas',pausadas,'canceladas',canceladas);
end $$;
revoke all on function public.maestro_pausar_agendas(uuid[]) from public,anon;
grant execute on function public.maestro_pausar_agendas(uuid[]) to authenticated;

create or replace function public.maestro_limpar_montagens(p_montagem_ids uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare ids uuid[]; limpas integer;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','gestor','operador')) then
   raise exception 'Sem permissão para limpar montagens.';
 end if;
 select array_agg(distinct id) into ids from unnest(p_montagem_ids) id;
 if coalesce(cardinality(ids),0)=0 or cardinality(ids)>1000 or array_position(ids,null) is not null then
   raise exception 'Selecione entre 1 e 1000 montagens.';
 end if;
 perform 1 from public.maestro_flow_montagens where id=any(ids) order by id for update;
 if (select count(*) from public.maestro_flow_montagens where id=any(ids)
   and public.current_user_can_access_carteira(carteira_id) is true
   and arquivado_em is null and status in ('pendente','atencao'))<>cardinality(ids) then
   raise exception 'Seleção contém montagem sem permissão ou que não está mais pendente. Atualize a lista.';
 end if;
 update public.maestro_flow_montagens set status='concluido',arquivado_em=now(),token=null,lease_ate=null,
   erro='Montagem encerrada por seleção no Maestro.',updated_at=now() where id=any(ids);
 get diagnostics limpas = row_count;
 return limpas;
end $$;
revoke all on function public.maestro_limpar_montagens(uuid[]) from public,anon;
grant execute on function public.maestro_limpar_montagens(uuid[]) to authenticated;
