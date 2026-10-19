begin;
-- A tag alone cannot authorize daytime mail: require the real handoff and exact recipients.
create function public.email_aviso_interno_autorizado(m public.mensagens) returns boolean
language sql volatile security invoker set search_path='' as $$
 select coalesce(m.canal='email' and m.contexto='mensageria' and m.aprovado_em is not null
  and m.cobranca_flow_id is null and m.acordo_flow_id is null and m.pre_juridico_flow_id is null
  and m.payload->'email_cc'=jsonb_build_array('edi.neves@gekali.com.br')
  and m.payload->'aviso_formalizacao'->>'autorizacao'='envio_automatico_interno_autorizado_pelo_operador'
  and exists(select 1 from public.central_pendencias c
   join public.acordos a on a.id::text=m.payload->'aviso_formalizacao'->>'acordo_id' and a.carteira_id=c.carteira_id and a.condominio_id=c.condominio_id
   where c.id::text=m.payload->>'keila_caso_id' and c.carteira_id=m.carteira_id and a.devedor_aceito_em is not null
    and m.id=md5('aviso-formalizacao-v1:'||c.id::text||':'||a.id::text)::uuid
    and exists(select 1 from jsonb_array_elements(coalesce(c.payload->'acordos','[]')) x
     where x->>'id'=a.id::text and x->>'unidade_id'=a.unidade_id::text
       and x->'formalizacao'->>'aviso_operador_mensagem_id'=m.id::text)
    and ((c.tipo='keila_atendimento' and c.carteira_id='e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'::uuid
      and m.destinatario='danielle.lima@gekali.com.br' and m.payload->'aviso_formalizacao'->>'regra'='operador_gekali_v1')
     or (c.tipo='lidia_atendimento' and c.carteira_id='06827218-e2b1-4267-ad8f-81a0ab222cad'::uuid
      and m.destinatario='acordos.camila@genskeadvogados.com.br' and m.payload->'aviso_formalizacao'->>'regra'='operador_lidia_v1'))),false);
$$;
revoke all on function public.email_aviso_interno_autorizado(public.mensagens) from public,anon,authenticated;
grant execute on function public.email_aviso_interno_autorizado(public.mensagens) to service_role;

-- Immediate slots for the internal notice only; daily quotas and uncertain attempts remain protected.
do $migration$
declare src text; anchor text;
begin
 src:=replace(pg_get_functiondef('public.email_reservar_horario(uuid,text,timestamptz)'::regprocedure),E'\r\n',E'\n');
 anchor:='select email_limite_diario into strict v_limit from public.carteiras where id=m.carteira_id;';
 if position(anchor in src)=0 then raise exception 'Âncora da agenda ausente.'; end if;
 src:=replace(src,anchor,anchor||$fast$
 if public.email_aviso_interno_autorizado(m) then
  delete from public.email_agenda where mensagem_id=p_mensagem;
  v_at:=greatest(p_base,clock_timestamp());
  for dia in 1..370 loop
   v_day:=(v_at at time zone 'America/Sao_Paulo')::date;
   v_start:=(v_day::timestamp at time zone 'America/Sao_Paulo');
   v_end:=((v_day+1)::timestamp at time zone 'America/Sao_Paulo');
   select count(*) filter(where carteira_id=m.carteira_id),count(*) filter(where remetente=p_remetente)
    into v_count_c,v_count_r from (
     select a.carteira_id,a.remetente from public.email_agenda a join public.mensagens x on x.id=a.mensagem_id where a.agendada_para>=v_start and a.agendada_para<v_end and x.status='agendada' and public.email_aviso_interno_autorizado(x)
     union all select t.carteira_id,t.remetente from public.email_tentativas t where t.iniciado_em>=v_start and t.iniciado_em<v_end
    ) q;
   if v_count_c>=v_limit or v_count_r>=50 then v_at:=v_end; continue; end if;
   insert into public.email_agenda(mensagem_id,carteira_id,remetente,agendada_para) values(p_mensagem,m.carteira_id,p_remetente,v_at);
   update public.mensagens set status='agendada',status_operacional='agendada',agendada_para=v_at,scheduled_at=v_at,proxima_tentativa_em=null,erro=null,erro_envio=null where id=p_mensagem;
   return v_at;
  end loop;
  raise exception 'Não foi possível reservar cota diária para o aviso interno.';
 end if;
 $fast$);
 execute src;

 src:=replace(pg_get_functiondef('public.email_reservar_disparo_interno(uuid,text)'::regprocedure),E'\r\n',E'\n');
 anchor:='v_now:=clock_timestamp();';
 if position(anchor in src)=0 then raise exception 'Âncora da reserva de disparo ausente.'; end if;
 src:=replace(src,anchor,anchor||E'\n select * into strict m from public.mensagens where id=p_mensagem for update;');
 anchor:='if not public.email_janela_noturna(v_now) then';
 if position(anchor in src)=0 then raise exception 'Âncora da janela inicial ausente.'; end if;
 src:=replace(src,anchor,'if not public.email_janela_noturna(v_now) and public.email_aviso_interno_autorizado(m) is not true then');
 anchor:=$old$v_last>v_now-interval '10 minutes'$old$;
 if position(anchor in src)=0 then raise exception 'Âncora do intervalo entre disparos ausente.'; end if;
 src:=replace(src,anchor,$new$(v_last>v_now-interval '10 minutes' and public.email_aviso_interno_autorizado(m) is not true)$new$);
 anchor:='or not public.email_janela_noturna(v_now)';
 if position(anchor in src)=0 then raise exception 'Âncora da janela final ausente.'; end if;
 src:=replace(src,anchor,'or (not public.email_janela_noturna(v_now) and public.email_aviso_interno_autorizado(m) is not true)');
 execute src;
end $migration$;

-- pg_net sends only after commit. The dedicated worker never loads ordinary daytime mail.
create function public.email_processar_avisos_internos() returns bigint
language plpgsql security definer set search_path='' as $$
declare token text; pedido bigint;
begin
 if not exists(select 1 from public.email_agenda a join public.mensagens m on m.id=a.mensagem_id
  where m.status='agendada' and a.agendada_para<=clock_timestamp() and m.payload->'aviso_formalizacao'->>'regra' in ('operador_gekali_v1','operador_lidia_v1') and public.email_aviso_interno_autorizado(m)) then return null; end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='gkli_email_agenda_token';
 if token is null then raise exception 'Credencial da agenda de e-mail indisponível.'; end if;
 select net.http_get(url:='https://gkli-cob.vercel.app/api/jobs/emails/disparar?avisos_internos=1',
  headers:=jsonb_build_object('Authorization','Bearer '||token),timeout_milliseconds:=60000) into pedido;
 return pedido;
end $$;
revoke all on function public.email_processar_avisos_internos() from public,anon,authenticated;
grant execute on function public.email_processar_avisos_internos() to service_role;

do $migration$
declare src text; anchor text:='perform public.email_reservar_horario(inserida,dominio);'; m record;
begin
 src:=pg_get_functiondef('public.agente_virtual_formalizacao_humana()'::regprocedure);
 execute replace(src,'Nenhum envio realizado.','Nenhuma comunicação ao condômino ou à administradora foi enviada por este encaminhamento.');
 src:=pg_get_functiondef('public.agente_virtual_avisar_operador()'::regprocedure);
 if position(anchor in src)=0 then raise exception 'Âncora do aviso ao operador ausente.'; end if;
 execute replace(src,anchor,anchor||$notify$
    begin perform public.email_processar_avisos_internos();
    exception when others then raise log 'Aviso interno mantido na fila; recuperação automática por cron.'; end;
 $notify$);
 -- Existing authorized pending notices may advance; never touch sent/uncertain messages or other mail.
 for m in select x.id,a.remetente from public.mensagens x join public.email_agenda a on a.mensagem_id=x.id
  where x.status='agendada' and public.email_aviso_interno_autorizado(x)
   and not exists(select 1 from public.email_tentativas t where t.mensagem_id=x.id and t.estado in ('em_envio','enviado','incerto')) loop
  perform public.email_reservar_horario(m.id,m.remetente,clock_timestamp());
 end loop;
end $migration$;
select cron.schedule('gkli-avisos-internos','* * * * *','select public.email_processar_avisos_internos();');
notify pgrst,'reload schema';
commit;
