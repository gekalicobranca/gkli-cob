CREATE OR REPLACE FUNCTION public.whatsapp_web_reservar(p_sessao text, p_numero text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m public.mensagens; v_token uuid; v_hora integer;
begin
 if not public.workers_whatsapp_permitido() then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('whatsapp-web:'||p_numero,0));
  v_hora := extract(hour from now() at time zone 'America/Sao_Paulo');
  if v_hora < 9 or v_hora >= 18 then return null; end if;
  if not exists(select 1 from whatsapp_web_sessoes where id=p_sessao and numero=p_numero and status='conectado' and atualizado_em>now()-interval '2 minutes') then return null; end if;
  -- Cadência global por número, inclusive com várias carteiras/processos.
  if exists(select 1 from whatsapp_web_envios where numero=p_numero and (estado = 'reservado' or iniciado_em>now()-interval '60 seconds')) then return null; end if;
  if (select count(*) from whatsapp_web_envios where numero=p_numero and (estado in ('reservado','enviado','incerto') or jsonb_array_length(recibos)>0) and (iniciado_em at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date) >= 50 then return null; end if;
  select msg.* into m from mensagens msg
    join carteiras c on c.id=msg.carteira_id
    where c.whatsapp_transporte='web' and c.whatsapp_web_sessao=p_sessao and c.whatsapp_web_numero=p_numero
      and msg.canal='whatsapp' and msg.status='agendada' and msg.agendada_para<=now()
      and (msg.proxima_tentativa_em is null or msg.proxima_tentativa_em<=now())
      and msg.provider_message_id is null
      and ((msg.cobranca_flow_id is not null or msg.acordo_flow_id is not null or msg.pre_juridico_flow_id is not null) or public.keila_whatsapp_elegivel(msg))
      and (msg.cobranca_flow_id is null or exists(select 1 from cobranca_flows f where f.id=msg.cobranca_flow_id and f.status='em_execucao'))
      and (msg.acordo_flow_id is null or exists(select 1 from acordo_flows f where f.id=msg.acordo_flow_id and f.status='em_execucao'))
      and (msg.pre_juridico_flow_id is null or exists(select 1 from pre_juridico_flows f where f.id=msg.pre_juridico_flow_id and f.status='em_execucao'))
      and not exists(select 1 from whatsapp_web_envios e where e.mensagem_id=msg.id and e.estado<>'falha')
    order by msg.agendada_para,msg.id for update of msg skip locked limit 1;
  if m.id is null then return null; end if;
  if m.cobranca_flow_id is not null then
    perform public.whatsapp_consolidar_lote(m.lote_id);
    select * into strict m from public.mensagens where id=coalesce((select (payload->>'consolidada_em')::uuid from public.mensagens where id=m.id),m.id);
  end if;
 if not public.flow_cobranca_mensagem_elegivel(m) then perform public.flow_cancelar_mensagem(m.id); return null; end if;
  insert into whatsapp_web_envios(mensagem_id,sessao,numero,estado) values(m.id,p_sessao,p_numero,'reservado') returning token into v_token;
  update mensagens set provider='whatsapp_web',provider_status='reservado',proxima_tentativa_em='9999-12-31',ultima_tentativa_em=now(),tentativas_envio=coalesce(tentativas_envio,0)+1 where id=m.id;
  return to_jsonb(m)||jsonb_build_object('reserva_token',v_token);
end $function$
