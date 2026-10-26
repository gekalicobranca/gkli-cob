-- Funções de produção capturadas em 26/10/2026 antes da migração de cotas por conta.
-- A integração aplica a migração nova sobre essas funções e verifica as travas reais.
CREATE OR REPLACE FUNCTION public.email_janela_noturna(p_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO ''
AS $function$
 select (p_at at time zone 'America/Sao_Paulo')::time >= time '22:00'
     or (p_at at time zone 'America/Sao_Paulo')::time < time '06:00';
$function$;


CREATE OR REPLACE FUNCTION public.email_proximo_horario_noturno(p_at timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO ''
AS $function$
 select case when public.email_janela_noturna(p_at) then p_at
 else (((p_at at time zone 'America/Sao_Paulo')::date + time '22:00') at time zone 'America/Sao_Paulo') end;
$function$;


CREATE OR REPLACE FUNCTION public.email_reservar_disparo_interno(p_mensagem uuid, p_remetente text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m public.mensagens; a public.email_agenda; v_limit integer; v_now timestamptz:=clock_timestamp();
 v_day date; v_c integer; v_r integer; v_last timestamptz; v_slot timestamptz; v_id uuid;
begin
  perform pg_advisory_xact_lock(9162026,50);
  v_now:=clock_timestamp();
 select * into strict m from public.mensagens where id=p_mensagem for update;
  if not public.email_janela_noturna(v_now) and public.email_liberacao_imediata_autorizada(m) is not true and (public.email_aviso_interno_autorizado(m) is not true and public.email_excecao_teste_autorizada(m) is not true) then return jsonb_build_object('permitido',false,'agendada_para',public.email_proximo_horario_noturno(v_now),'motivo','Envios de e-mail somente entre 22h e 06h (Brasília).'); end if;
  select * into strict m from public.mensagens where id=p_mensagem for update;
  if public.agente_proposta_mensagem_elegivel(m) is not true then update public.mensagens set status='cancelada',status_operacional='cancelada',erro_envio='Proposta ou lembrete não está mais vigente; nova proposta necessária.' where id=m.id and status in ('agendada','aprovada'); delete from public.email_agenda where mensagem_id=m.id; return jsonb_build_object('permitido',false,'motivo','Proposta ou lembrete não está mais vigente; nova proposta e aprovação necessárias.'); end if;
 if not public.flow_cobranca_mensagem_elegivel(m) then perform public.flow_cancelar_mensagem(m.id); return jsonb_build_object('permitido',false,'motivo','Cobrança fora da cobrança ativa.'); end if;
  if m.canal<>'email' or m.status not in ('agendada','aprovada') then return jsonb_build_object('permitido',false,'motivo','Mensagem não aprovada ou já processada.'); end if;
  if m.cobranca_flow_id is not null and not exists(select 1 from public.cobranca_flows where id=m.cobranca_flow_id and status='em_execucao') then
    return jsonb_build_object('permitido',false,'motivo','Flow não está ativo.'); end if;
  if m.acordo_flow_id is not null and not exists(select 1 from public.acordo_flows where id=m.acordo_flow_id and status='em_execucao') then
    return jsonb_build_object('permitido',false,'motivo','Flow não está ativo.'); end if;
  if m.pre_juridico_flow_id is not null and not exists(select 1 from public.pre_juridico_flows where id=m.pre_juridico_flow_id and status='em_execucao') then
    return jsonb_build_object('permitido',false,'motivo','Flow não está ativo.'); end if;
  if exists(select 1 from public.email_tentativas where mensagem_id=p_mensagem and estado in ('em_envio','incerto','enviado')) then
    return jsonb_build_object('permitido',false,'motivo','Envio já reservado, concluído ou aguardando conferência.'); end if;
  if not exists(select 1 from public.carteiras where id=m.carteira_id and email_habilitado is distinct from false) then
    raise exception 'E-mail desabilitado na carteira.'; end if;
  select * into a from public.email_agenda where mensagem_id=p_mensagem;
  if a.mensagem_id is null or a.remetente<>p_remetente then
    v_slot:=public.email_reservar_horario(p_mensagem,p_remetente,greatest(v_now,coalesce(m.agendada_para,v_now)));
    return jsonb_build_object('permitido',false,'agendada_para',v_slot,'motivo','Horário reservado.');
  end if;
  if a.agendada_para>v_now then return jsonb_build_object('permitido',false,'agendada_para',a.agendada_para,'motivo','Aguardando horário.'); end if;
  v_day:=(v_now at time zone 'America/Sao_Paulo')::date;
  select email_limite_diario into strict v_limit from public.carteiras where id=m.carteira_id;
  select count(*) filter(where carteira_id=m.carteira_id),count(*) filter(where remetente=p_remetente),
    max(iniciado_em) filter(where carteira_id=m.carteira_id or remetente=p_remetente)
    into v_c,v_r,v_last from public.email_tentativas where (iniciado_em at time zone 'America/Sao_Paulo')::date=v_day;
  if v_c>=v_limit or v_r>=50 or (v_last>v_now-interval '10 minutes' and (public.email_aviso_interno_autorizado(m) is not true and public.email_excecao_teste_autorizada(m) is not true))
    or (not public.email_janela_noturna(v_now) and public.email_liberacao_imediata_autorizada(m) is not true and (public.email_aviso_interno_autorizado(m) is not true and public.email_excecao_teste_autorizada(m) is not true)) then
    v_slot:=public.email_reservar_horario(p_mensagem,p_remetente,v_now);
    return jsonb_build_object('permitido',false,'agendada_para',v_slot,'motivo','Limite ou janela de envio.');
  end if;
  insert into public.email_tentativas(mensagem_id,carteira_id,remetente,iniciado_em,estado)
    values(p_mensagem,m.carteira_id,p_remetente,v_now,'em_envio') returning id into v_id;
  delete from public.email_agenda where mensagem_id=p_mensagem;
  return jsonb_build_object('permitido',true,'tentativa_id',v_id);
end $function$;


CREATE OR REPLACE FUNCTION public.thunderbird_reservar(p_dispositivo uuid, p_somente_teste boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d thunderbird_dispositivos; e thunderbird_envios; m mensagens; r jsonb;
begin
 perform pg_advisory_xact_lock(9162026,50);
 select * into strict d from thunderbird_dispositivos where id=p_dispositivo for update;
 if not d.ativo then return null; end if;
 update thunderbird_dispositivos set visto_em=now() where id=d.id;
 if exists(select 1 from thunderbird_envios where dispositivo_id=d.id and estado in ('reservado','enviando','incerto')) then return null; end if;
 select * into e from thunderbird_envios where dispositivo_id=d.id and tipo='teste' and estado='pendente' order by criado_em limit 1 for update;
 if e.id is not null then
  update thunderbird_envios set estado='reservado',atualizado_em=now() where id=e.id returning * into e;
  return to_jsonb(e);
 end if;
 if p_somente_teste or not d.automatico or d.testado_em is null or not exists(select 1 from carteiras where id=d.carteira_id and email_transporte='thunderbird') then return null; end if;
 if not public.email_janela_noturna(clock_timestamp()) and not exists(
  select 1 from public.mensagens x join public.email_agenda a on a.mensagem_id=x.id
  where x.carteira_id=d.carteira_id and x.status='agendada' and a.agendada_para<=now()
  and public.email_liberacao_imediata_autorizada(x)) then return null; end if;
 for m in select x.* from mensagens x join email_agenda a on a.mensagem_id=x.id
  where x.carteira_id=d.carteira_id and x.canal='email' and x.status='agendada' and x.agendada_para<=now()
  and x.pre_juridico_flow_id is null and not exists(select 1 from thunderbird_envios t where t.mensagem_id=x.id)
  order by x.agendada_para,x.id limit 20 for update of x skip locked loop
  r:=email_reservar_disparo_interno(m.id,split_part(lower(d.email),'@',2));
  if (r->>'permitido')::boolean then
   insert into thunderbird_envios(dispositivo_id,mensagem_id,tentativa_id,tipo,estado)
    values(d.id,m.id,(r->>'tentativa_id')::uuid,'fila','reservado') returning * into e;
   return to_jsonb(e);
  end if;
 end loop;
 return null;
end $function$;
