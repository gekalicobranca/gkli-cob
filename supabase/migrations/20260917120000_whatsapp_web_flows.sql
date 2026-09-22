begin;

alter table public.carteiras
  add column whatsapp_transporte text not null default 'cloud' check (whatsapp_transporte in ('cloud','web')),
  add column whatsapp_web_sessao text,
  add column whatsapp_web_numero text;

create table public.whatsapp_web_sessoes (
  id text primary key,
  numero text,
  status text not null,
  atualizado_em timestamptz not null default now()
);
create table public.whatsapp_web_envios (
  mensagem_id uuid not null references public.mensagens(id),
  token uuid primary key default gen_random_uuid(),
  sessao text not null,
  numero text not null,
  estado text not null check (estado in ('reservado','enviado','falha','incerto')),
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  recibos jsonb not null default '[]',
  erro text
);
create unique index whatsapp_web_envio_ativo on public.whatsapp_web_envios(mensagem_id) where estado <> 'falha';
alter table public.whatsapp_web_sessoes enable row level security;
alter table public.whatsapp_web_envios enable row level security;
revoke all on public.whatsapp_web_sessoes,public.whatsapp_web_envios from anon,authenticated;
grant all on public.whatsapp_web_sessoes,public.whatsapp_web_envios to service_role;

-- A reserva não expira: queda do processo exige conferência, nunca repetição cega.
create function public.whatsapp_web_reservar(p_sessao text,p_numero text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m public.mensagens; v_token uuid; v_hora integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('whatsapp-web:'||p_numero,0));
  v_hora := extract(hour from now() at time zone 'America/Sao_Paulo');
  if v_hora < 9 or v_hora >= 18 then return null; end if;
  if not exists(select 1 from whatsapp_web_sessoes where id=p_sessao and numero=p_numero and status='conectado' and atualizado_em>now()-interval '2 minutes') then return null; end if;
  -- Cadência global por número, inclusive com várias carteiras/processos.
  if exists(select 1 from whatsapp_web_envios where numero=p_numero and (estado in ('reservado','incerto') or iniciado_em>now()-interval '60 seconds')) then return null; end if;
  if (select count(*) from whatsapp_web_envios where numero=p_numero and (iniciado_em at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date) >= 50 then return null; end if;
  select msg.* into m from mensagens msg
    join carteiras c on c.id=msg.carteira_id
    where c.whatsapp_transporte='web' and c.whatsapp_web_sessao=p_sessao and c.whatsapp_web_numero=p_numero
      and msg.canal='whatsapp' and msg.status='agendada' and msg.agendada_para<=now()
      and (msg.proxima_tentativa_em is null or msg.proxima_tentativa_em<=now())
      and msg.provider_message_id is null
      and (msg.cobranca_flow_id is not null or msg.acordo_flow_id is not null or msg.pre_juridico_flow_id is not null)
      and (msg.cobranca_flow_id is null or exists(select 1 from cobranca_flows f where f.id=msg.cobranca_flow_id and f.status='em_execucao'))
      and (msg.acordo_flow_id is null or exists(select 1 from acordo_flows f where f.id=msg.acordo_flow_id and f.status='em_execucao'))
      and (msg.pre_juridico_flow_id is null or exists(select 1 from pre_juridico_flows f where f.id=msg.pre_juridico_flow_id and f.status='em_execucao'))
      and not exists(select 1 from whatsapp_web_envios e where e.mensagem_id=msg.id and e.estado<>'falha')
    order by msg.agendada_para,msg.id for update of msg skip locked limit 1;
  if m.id is null then return null; end if;
  insert into whatsapp_web_envios(mensagem_id,sessao,numero,estado) values(m.id,p_sessao,p_numero,'reservado') returning token into v_token;
  update mensagens set provider='whatsapp_web',provider_status='reservado',proxima_tentativa_em='9999-12-31',ultima_tentativa_em=now(),tentativas_envio=coalesce(tentativas_envio,0)+1 where id=m.id;
  return to_jsonb(m)||jsonb_build_object('reserva_token',v_token);
end $$;

-- Recibo, itens, contadores e auditoria são gravados na mesma transação.
create function public.whatsapp_web_concluir(p_token uuid,p_estado text,p_recibos jsonb default '[]',p_erro text default null)
returns void language plpgsql security definer set search_path=public as $$
declare e public.whatsapp_web_envios; m public.mensagens; v_status text; v_table text; v_field text; v_id uuid;
begin
  select * into strict e from whatsapp_web_envios where token=p_token for update;
  if e.estado <> 'reservado' then return; end if;
  if p_estado not in ('enviado','falha','incerto') then raise exception 'Resultado inválido'; end if;
  if p_estado='enviado' and (jsonb_typeof(p_recibos)<>'array' or jsonb_array_length(p_recibos)=0) then raise exception 'Recibo obrigatório'; end if;
  select * into strict m from mensagens where id=e.mensagem_id for update;
  v_status := case when p_estado='enviado' then 'enviada' when m.status='cancelada' and p_estado='falha' then 'cancelada' else 'falha' end;
  update whatsapp_web_envios set estado=p_estado,recibos=p_recibos,erro=p_erro,finalizado_em=now() where token=p_token;
  update mensagens set status=v_status,status_operacional=v_status,
    provider='whatsapp_web',provider_status=p_estado,provider_payload=jsonb_build_object('recibos',p_recibos,'sessao',e.sessao,'numero',e.numero),
    provider_message_id=case when p_estado='enviado' then p_recibos->>0 else null end,
    sent_at=case when p_estado='enviado' then now() else sent_at end,
    enviada_em=case when p_estado='enviado' then now() else enviada_em end,
    erro=p_erro,erro_envio=p_erro,provider_error_message=p_erro,
    proxima_tentativa_em=case when p_estado='incerto' then '9999-12-31'::timestamptz else null end
    where id=m.id;
  update lote_itens set status=case when p_estado='enviado' then 'enviado' when v_status='cancelada' then 'cancelado' else 'erro' end,erro=p_erro where mensagem_id=m.id;
  if p_estado='enviado' and m.pre_juridico_flow_id is not null then
    update pre_juridico_casos set procuracao_status='enviada'
      where procuracao_flow_id=m.pre_juridico_flow_id and procuracao_status='gerada'
      and ((m.cobranca_id is not null and cobranca_id=m.cobranca_id) or (m.acordo_id is not null and acordo_id=m.acordo_id));
  end if;
  insert into mensageria_logs(carteira_id,lote_id,lote_item_id,mensagem_id,evento,status_anterior,status_novo,descricao,payload)
    values(m.carteira_id,m.lote_id,m.lote_item_id,m.id,'whatsapp_web_'||p_estado,m.status,v_status,
      coalesce(p_erro,'Envio automático pelo WhatsApp Web.'),jsonb_build_object('sessao',e.sessao,'numero',e.numero,'recibos',p_recibos));
  for v_table,v_field,v_id in select * from (values
    ('cobranca_flows','cobranca_flow_id',m.cobranca_flow_id),('acordo_flows','acordo_flow_id',m.acordo_flow_id),('pre_juridico_flows','pre_juridico_flow_id',m.pre_juridico_flow_id)
  ) x(t,f,id) loop
    if v_id is null then continue; end if;
    execute format('update %I f set total_mensagens=s.total,total_pendentes=s.pendentes,total_agendadas=s.agendadas,total_enviadas=s.enviadas,total_falhas=s.falhas,proximo_disparo_em=s.proximo,
      status=case when f.status in (''pausado'',''cancelado'') then f.status when s.pendentes+s.agendadas>0 then ''em_execucao'' when s.falhas>0 then ''concluido_com_falhas'' else ''concluido'' end,
      concluido_em=case when s.pendentes+s.agendadas=0 then now() else null end
      from (select count(*) total,count(*) filter(where status in (''rascunho'',''pendente_aprovacao'',''aprovada'')) pendentes,count(*) filter(where status=''agendada'') agendadas,count(*) filter(where status=''enviada'') enviadas,count(*) filter(where status=''falha'') falhas,min(agendada_para) filter(where status=''agendada'') proximo from mensagens where %I=$1) s where f.id=$1',v_table,v_field) using v_id;
  end loop;
  update lotes l set total_pendentes=s.pendentes,total_enviadas=s.enviadas,total_erros=s.falhas,
    status=case when s.pendentes>0 then 'aprovado' when s.falhas>0 then 'concluido_com_falhas' else 'enviado' end,
    finalizado_em=case when s.pendentes=0 then now() else null end
    from (select count(*) filter(where status in ('rascunho','pendente_aprovacao','aprovada','agendada')) pendentes,count(*) filter(where status='enviada') enviadas,count(*) filter(where status='falha') falhas from mensagens where lote_id=m.lote_id) s where l.id=m.lote_id;
end $$;

-- Reenvio pelo Flow continua possível apenas quando nada chegou a ser transmitido.
create function public.whatsapp_web_proteger_reenvio() returns trigger language plpgsql security definer set search_path=public as $$
begin
  -- Também protege contra workers Cloud da versão anterior durante o rollout.
  if new.canal='whatsapp' and new.status='agendada' and new.proxima_tentativa_em is not null
    and new.proxima_tentativa_em is distinct from old.proxima_tentativa_em
    and new.provider is distinct from 'whatsapp_web'
    and exists(select 1 from carteiras where id=new.carteira_id and whatsapp_transporte='web') then
    return null;
  end if;
  if new.status='enviada' and old.status is distinct from new.status
    and exists(select 1 from whatsapp_web_envios where mensagem_id=old.id and estado in ('reservado','incerto')) then
    raise exception 'Confirme o resultado pela conferência administrativa do WhatsApp Web.';
  end if;
  if new.status in ('aprovada','agendada','pendente_aprovacao') and old.status is distinct from new.status then
    if exists(select 1 from whatsapp_web_envios where mensagem_id=old.id and estado in ('reservado','incerto','enviado')) then
      raise exception 'WhatsApp Web: envio reservado, incerto ou já enviado. Confira a conversa antes de qualquer novo envio.';
    end if;
  end if;
  return new;
end $$;
create trigger whatsapp_web_proteger_reenvio before update on mensagens for each row execute function whatsapp_web_proteger_reenvio();

-- Somente o servidor administrativo pode registrar uma conferência humana.
create function public.whatsapp_web_conferir(p_token uuid,p_enviado boolean,p_usuario uuid,p_observacao text)
returns void language plpgsql security definer set search_path=public as $$
declare e public.whatsapp_web_envios;
begin
  if p_usuario is null or length(trim(coalesce(p_observacao,'')))<10 then raise exception 'Registre o responsável e o resultado da conferência.'; end if;
  select * into strict e from whatsapp_web_envios where token=p_token for update;
  if e.estado not in ('reservado','incerto') then raise exception 'Reserva já encerrada.'; end if;
  if exists(select 1 from whatsapp_web_sessoes where id=e.sessao and status in ('conectado','iniciando','aguardando_qr') and atualizado_em>now()-interval '2 minutes') then
    raise exception 'Pare o worker antes de conferir a reserva.';
  end if;
  if not p_enviado and jsonb_array_length(e.recibos)>0 then raise exception 'Há envio parcial. Confira e complete os anexos na conversa antes de confirmar tudo enviado.'; end if;
  update whatsapp_web_envios set estado='reservado' where token=p_token;
  perform whatsapp_web_concluir(p_token,case when p_enviado then 'enviado' else 'falha' end,
    case when p_enviado then e.recibos||jsonb_build_array('confirmacao_manual:'||p_token::text) else '[]'::jsonb end,
    case when p_enviado then null else 'Operador confirmou ausência de transmissão; reenvio liberado no Flow.' end);
  insert into mensageria_logs(mensagem_id,evento,descricao,payload)
    values(e.mensagem_id,'whatsapp_web_conferencia',p_observacao,jsonb_build_object('usuario_id',p_usuario,'reserva',p_token,'enviado',p_enviado));
end $$;

revoke all on function public.whatsapp_web_reservar(text,text),public.whatsapp_web_concluir(uuid,text,jsonb,text),public.whatsapp_web_proteger_reenvio() from public,anon,authenticated;
grant execute on function public.whatsapp_web_reservar(text,text),public.whatsapp_web_concluir(uuid,text,jsonb,text) to service_role;
revoke all on function public.whatsapp_web_conferir(uuid,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.whatsapp_web_conferir(uuid,boolean,uuid,text) to service_role;
commit;
