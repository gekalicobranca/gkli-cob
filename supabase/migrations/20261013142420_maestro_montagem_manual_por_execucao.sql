begin;
-- Reivindica apenas a montagem vinculada ao clique manual, sem consumir a fila global.
create function public.maestro_flow_claim_execucao(p_execucao_id uuid)
returns setof public.maestro_flow_montagens
language plpgsql security invoker set search_path=public set statement_timeout='10s' as $$
declare j public.maestro_flow_montagens;
begin
  perform pg_advisory_xact_lock(9172026,1);
  update maestro_flow_montagens m set status='atencao',erro='Execução interrompida repetidamente. Use Retomar montagem.',updated_at=now()
  where m.execucao_id=p_execucao_id and m.status='processando' and m.lease_ate<now() and m.tentativas>=5;
  select m.* into j from maestro_flow_montagens m
  join agente_execucoes e on e.id=m.execucao_id
  where m.execucao_id=p_execucao_id and e.origem='maestro' and e.agendado_para is null
    and (m.status='pendente' or (m.status='processando' and m.lease_ate<now()))
    and not exists(select 1 from maestro_flow_montagens b where b.condominio_id=m.condominio_id and b.id<>m.id and b.status='processando' and b.lease_ate>=now())
  order by m.updated_at,m.id limit 1 for update of m skip locked;
  if j.id is null then return; end if;
  return query update maestro_flow_montagens set status='processando',token=gen_random_uuid(),lease_ate=now()+interval '4 minutes',
    tentativas=tentativas+1,updated_at=now() where id=j.id returning *;
end $$;
revoke all on function public.maestro_flow_claim_execucao(uuid) from public,anon,authenticated;
grant execute on function public.maestro_flow_claim_execucao(uuid) to service_role;
commit;
