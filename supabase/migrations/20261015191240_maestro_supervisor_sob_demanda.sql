begin;
-- Uma consulta leve substitui a consulta ociosa de cada coletor.
create or replace function public.maestro_supervisor_fila(p_agendar boolean default false,p_script_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_now timestamptz:=clock_timestamp(); v_local timestamp; v_ativo boolean;
 v_keys text[]:=array['bbz_condopro_clock_vila_romana','manager_atentum_cotas_pendentes','villagua_condopro_square_guarulhos','verti_winker_inadimplencia','captacao_atipass','captacao_lello','captacao_hflex','captacao_graiche'];
 v_fila jsonb; v_agendadas integer:=0;
begin
 v_local:=v_now at time zone 'America/Sao_Paulo';
 select coalesce((select ativo from public.automacao_controle where chave='captacao_global'),true) into v_ativo;
 if p_agendar and v_ativo then
  perform pg_advisory_xact_lock(15102026,1912);
  with novas as (
   insert into public.agente_execucoes(receita_id,administradora_id,carteira_id,condominio_id,status,tentativas,origem,competencia)
   select r.id,r.administradora_id,coalesce(c.carteira_id,r.carteira_id),c.id,'pendente',0,'agenda_mensal',to_char(v_local,'YYYY-MM')
   from public.agente_receitas r join public.condominios c on c.id::text=r.config_json->>'condominio_id'
   where r.ativo and r.script_key=any(v_keys) and c.status='ativo' and c.captacao_automatica_habilitada
    and c.captacao_dia_mes is not null
    and (extract(day from v_local)>c.captacao_dia_mes or (extract(day from v_local)=c.captacao_dia_mes and v_local::time>=coalesce(c.captacao_horario::time,time '08:00')))
    and (r.script_key<>'captacao_lello' or (coalesce(nullif(trim(r.config_json->>'codigo_portal'),''),nullif(trim(r.config_json->>'codigo_cliente'),'')) is not null and coalesce(r.config_json->>'codigo_pendente','false')<>'true'))
    and not exists(select 1 from public.agente_execucoes e where e.receita_id=r.id and e.condominio_id=c.id and e.origem='agenda_mensal' and e.competencia=to_char(v_local,'YYYY-MM'))
   on conflict do nothing returning id
  ), logs as (
   insert into public.agente_logs(execucao_id,step,nivel,mensagem,metadata_json)
   select id,'agenda_mensal','info','Execução mensal criada pelo supervisor do Maestro.',jsonb_build_object('fuso','America/Sao_Paulo') from novas returning id
  ) select count(*) into v_agendadas from novas;
 end if;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into v_fila from (
  select distinct on (r.script_key) e.id,r.script_key,e.origem,e.agendado_para,e.created_at
  from public.agente_execucoes e join public.agente_receitas r on r.id=e.receita_id
  where e.status='pendente' and r.ativo and r.script_key=any(v_keys)
   and (p_script_key is null or r.script_key=p_script_key)
   and (e.agendado_para is null or e.agendado_para<=v_now)
   and (v_ativo or e.origem in ('manual','manual_agendada','manual_administradora') or e.origem like 'manual_worker:%' or (e.origem='maestro' and e.agendado_para is null))
   and not exists(select 1 from public.agente_execucoes busy join public.agente_receitas br on br.id=busy.receita_id where busy.status='em_execucao' and br.script_key=r.script_key)
  order by r.script_key,e.created_at,e.id
 ) q;
 return jsonb_build_object('pendentes',v_fila,'agendadas',v_agendadas,'captacao_ativa',v_ativo);
end $$;
revoke all on function public.maestro_supervisor_fila(boolean,text) from public,anon,authenticated;
grant execute on function public.maestro_supervisor_fila(boolean,text) to service_role;
notify pgrst,'reload schema';
commit;
