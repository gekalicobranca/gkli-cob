begin;

create table public.whatsapp_worker_controles (
  sessao text primary key check (sessao ~ '^[a-zA-Z0-9_-]{1,60}$'),
  habilitado boolean not null default true,
  reiniciar_id uuid,
  aplicado_id uuid,
  solicitado_por uuid,
  atualizado_em timestamptz not null default now(),
  supervisor_em timestamptz,
  supervisor_status text,
  reinicios integer not null default 0
);
alter table public.whatsapp_worker_controles enable row level security;
revoke all on public.whatsapp_worker_controles from anon, authenticated;
grant all on public.whatsapp_worker_controles to service_role;

-- Keep every current eligibility rule; only remove the session-wide hold for
-- completed uncertain attempts. A running reservation still locks the line.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.whatsapp_web_reservar(text,text)'::regprocedure);
  if position('estado in (''reservado'',''incerto'')' in definition) = 0 then
    raise exception 'Regra de reserva inesperada; revise antes de aplicar';
  end if;
  execute replace(definition, 'estado in (''reservado'',''incerto'')', 'estado = ''reservado''');
end $$;

-- An explicit, audited retry accepts possible duplication without pretending
-- the operator verified non-delivery. Only an uncertain, completed attempt
-- can be retried; never an in-flight reservation or an already confirmed send.
create function public.whatsapp_web_reenviar_incerto(p_token uuid,p_usuario uuid,p_observacao text)
returns void language plpgsql security definer set search_path=public as $$
declare e whatsapp_web_envios; m mensagens; t text; f text; fid uuid; fs text;
begin
  if p_usuario is null or length(trim(coalesce(p_observacao,'')))<10 then raise exception 'Identifique o responsável e a justificativa.'; end if;
  select * into strict e from whatsapp_web_envios where token=p_token for update;
  if e.estado<>'incerto' then raise exception 'Somente resultados incertos podem ser reenviados.'; end if;
  select * into strict m from mensagens where id=e.mensagem_id for update;
  if m.status<>'falha' or m.provider_message_id is not null then raise exception 'Mensagem não disponível para reenvio.'; end if;
  for t,f,fid in select * from (values ('cobranca_flows','cobranca_flow_id',m.cobranca_flow_id),('acordo_flows','acordo_flow_id',m.acordo_flow_id),('pre_juridico_flows','pre_juridico_flow_id',m.pre_juridico_flow_id)) x(t,f,id) loop
    if fid is null then continue; end if;
    execute format('select status from %I where id=$1 for update',t) into fs using fid;
    if fs is null or fs not in ('em_execucao','concluido_com_falhas') then raise exception 'Ative ou retome o Flow antes de reenviar.'; end if;
  end loop;
  insert into mensageria_logs(mensagem_id,carteira_id,evento,descricao,payload)
    values(m.id,m.carteira_id,'whatsapp_web_reenvio_autorizado',p_observacao,jsonb_build_object('usuario_id',p_usuario,'reserva',p_token,'risco_duplicidade_aceito',true,'recibos_anteriores',e.recibos,'erro_anterior',e.erro));
  update whatsapp_web_envios set estado='falha' where token=p_token;
  update mensagens set status='agendada',status_operacional='agendada',agendada_para=now(),proxima_tentativa_em=null,provider_status='reenvio_autorizado',erro=null,erro_envio=null where id=m.id;
  update lote_itens set status='aprovado',erro=null where mensagem_id=m.id;
  for t,f,fid in select * from (values ('cobranca_flows','cobranca_flow_id',m.cobranca_flow_id),('acordo_flows','acordo_flow_id',m.acordo_flow_id),('pre_juridico_flows','pre_juridico_flow_id',m.pre_juridico_flow_id)) x(t,f,id) loop
    if fid is null then continue; end if;
    execute format('update %I set status=''em_execucao'',concluido_em=null,total_agendadas=coalesce(total_agendadas,0)+1,total_falhas=greatest(coalesce(total_falhas,0)-1,0),proximo_disparo_em=least(proximo_disparo_em,now()) where id=$1',t) using fid;
  end loop;
  update lotes set status='aprovado',finalizado_em=null,total_pendentes=coalesce(total_pendentes,0)+1,total_erros=greatest(coalesce(total_erros,0)-1,0) where id=m.lote_id;
end $$;
revoke all on function public.whatsapp_web_reenviar_incerto(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.whatsapp_web_reenviar_incerto(uuid,uuid,text) to service_role;
commit;
