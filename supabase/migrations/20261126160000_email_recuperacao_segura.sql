begin;

alter table public.email_tentativas
  add column recuperacao text check (recuperacao in ('repetir','permanente','conferencia')),
  add column dados_transmitidos boolean,
  add column erro_resultado text,
  add column recuperada_em timestamptz;

create index if not exists email_tentativas_mensagem_recente on public.email_tentativas(mensagem_id,iniciado_em desc,id desc);

-- Finalização e recuperação usam a mesma trava da reserva, inclusive se concorrem.
create or replace function public.email_finalizar_disparo(p_tentativa uuid,p_estado text)
returns void language plpgsql security definer set search_path='' as $$
declare v_mensagem uuid;
begin
  perform pg_advisory_xact_lock(9162026,50);
  if p_estado not in ('enviado','falha','incerto') then raise exception 'Estado inválido.'; end if;
  update public.email_tentativas set estado=p_estado,finalizado_em=now() where id=p_tentativa and estado='em_envio' returning mensagem_id into v_mensagem;
  if p_estado='enviado' and v_mensagem is not null then
    update public.mensagens set status='enviada',status_operacional='enviada',enviada_em=now(),sent_at=now(),erro=null,erro_envio=null where id=v_mensagem;
    update public.lote_itens set status='enviado' where mensagem_id=v_mensagem;
  end if;
end $$;
revoke all on function public.email_finalizar_disparo(uuid,text) from public,anon,authenticated;
grant execute on function public.email_finalizar_disparo(uuid,text) to service_role;

-- Restrita ao transporte no servidor; nunca aceita decisão de segurança do navegador.
create function public.email_registrar_falha_smtp(p_tentativa uuid,p_recuperacao text,p_dados_transmitidos boolean,p_erro text)
returns void language plpgsql security definer set search_path='' as $$
declare t public.email_tentativas;
begin
  perform pg_advisory_xact_lock(9162026,50);
  if p_recuperacao is null or p_recuperacao not in ('repetir','permanente','conferencia') then raise exception 'Classificação SMTP inválida'; end if;
  select * into strict t from public.email_tentativas where id=p_tentativa for update;
  if t.estado<>'em_envio' then return; end if;
  update public.email_tentativas set recuperacao=p_recuperacao,dados_transmitidos=p_dados_transmitidos,
    erro_resultado=left(p_erro,1000) where id=t.id;
  perform public.email_finalizar_disparo(t.id,case when p_recuperacao='conferencia' then 'incerto' else 'falha' end);
  update public.mensagens set status='falha',status_operacional='falha',erro=left(p_erro,1000),erro_envio=left(p_erro,1000)
    where id=t.mensagem_id and status not in ('enviada','cancelada');
  update public.lote_itens set status='erro' where mensagem_id=t.mensagem_id and status<>'enviado';
end $$;

create function public.email_recuperar_falhas_flows(p_limite integer default 100,p_flow uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.mensagens; t public.email_tentativas; fs text; v_slot timestamptz;
  v_n integer; v_reagendadas integer:=0; v_conferencia integer:=0; v_refs jsonb:='[]';
  v_class text; v_old jsonb; v_erro text;
begin
  -- Mesma ordem de lock da reserva: serializa concorrência com os disparadores.
  perform pg_advisory_xact_lock(9162026,50);
  -- Também classifica reservas antigas de mensagens canceladas ou removidas.
  -- Só acrescenta evidência/auditoria: não reabre nem recria essas mensagens.
  for t in select e.* from public.email_tentativas e
    where e.estado='em_envio' and e.iniciado_em<now()-interval '10 minutes'
      and e.recuperacao is null
      and (p_flow is null or exists(select 1 from public.mensagens x where x.id=e.mensagem_id and x.cobranca_flow_id=p_flow))
    order by e.iniciado_em limit greatest(1,least(coalesce(p_limite,100),100)) for update
  loop
    update public.email_tentativas set recuperacao='conferencia' where id=t.id;
    insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,antes,depois)
      select carteira_id,'email_tentativa',id,'email.tentativa_abandonada','Tentativa antiga de e-mail exige conferência',
        jsonb_build_object('estado',estado,'iniciado_em',iniciado_em),
        jsonb_build_object('recuperacao','conferencia','mensagem_id',mensagem_id,'origem','email-dispatcher')
      from public.email_tentativas where id=t.id;
  end loop;
  for m in
    select x.* from public.mensagens x
    join public.carteiras c on c.id=x.carteira_id
    join lateral (select e.* from public.email_tentativas e where e.mensagem_id=x.id order by e.iniciado_em desc,e.id desc limit 1) e on true
    where x.canal='email' and c.email_transporte='smtp'
      and (x.cobranca_flow_id is not null or x.acordo_flow_id is not null) and x.pre_juridico_flow_id is null
      and (p_flow is null or x.cobranca_flow_id=p_flow)
      and x.status in ('falha','agendada') and x.sent_at is null and x.enviada_em is null
      and e.recuperada_em is null
      and ((e.estado in ('falha','incerto')) or (e.estado='em_envio' and e.iniciado_em<now()-interval '10 minutes'))
      and (e.recuperacao is distinct from 'repetir' or (c.email_habilitado is distinct from false and (
        exists(select 1 from public.cobranca_flows f where f.id=x.cobranca_flow_id and f.iniciado_em is not null and f.status in ('em_execucao','concluido_com_falhas'))
        or exists(select 1 from public.acordo_flows f where f.id=x.acordo_flow_id and f.iniciado_em is not null and f.status in ('em_execucao','concluido_com_falhas')))))
    order by e.iniciado_em,x.id limit greatest(1,least(coalesce(p_limite,100),100))
    for update of x
  loop
    select * into strict t from public.email_tentativas where mensagem_id=m.id order by iniciado_em desc,id desc limit 1 for update;
    v_old:=jsonb_build_object('status',m.status,'agendada_para',m.agendada_para,'tentativa_id',t.id,'estado',t.estado,'erro',m.erro,'erro_envio',m.erro_envio);
    v_class:=t.recuperacao;
    -- O timeout de conexão do código histórico é anterior à transmissão. ECONNRESET
    -- e timeout de confirmação antigos não informam a etapa: não provam segurança.
    if t.estado='em_envio' or t.estado='incerto' then v_class:='conferencia';
    elsif v_class is null then
      v_class:=case when coalesce(m.erro_envio,m.erro)='Tempo excedido na conexão SMTP.' then 'repetir' else 'conferencia' end;
    end if;
    update public.email_tentativas set recuperacao=v_class where id=t.id and recuperacao is null;
    update public.email_tentativas set erro_resultado=left(coalesce(m.erro_envio,m.erro),1000) where id=t.id and erro_resultado is null;
    if v_class='conferencia' then
      -- Não reescreve o resultado antigo: acrescenta a decisão de conferência.
      update public.email_tentativas set recuperacao='conferencia',recuperada_em=now() where id=t.id;
      update public.mensagens set status='falha',status_operacional='falha',proxima_tentativa_em=null,
        erro_envio='Envio sem confirmação; conferir o provedor antes de qualquer reenvio.' where id=m.id;
      update public.lote_itens set status='erro' where mensagem_id=m.id and status<>'enviado';
      v_conferencia:=v_conferencia+1;
      v_slot:=null;
    elsif v_class='repetir' and m.status='falha' then
      -- Qualquer tentativa possivelmente enviada impede recuperar uma falha posterior.
      if exists(select 1 from public.email_tentativas e where e.mensagem_id=m.id and
        (e.estado in ('em_envio','incerto','enviado') or e.recuperacao='conferencia'))
        or exists(select 1 from public.thunderbird_envios e where e.mensagem_id=m.id and e.estado in ('reservado','enviando','enviado','incerto')) then
        update public.email_tentativas set recuperacao='conferencia',recuperada_em=now() where id=t.id;
        continue;
      end if;
      -- Nunca retoma um Flow pausado/cancelado/pronto. Um encerramento por falha
      -- pode continuar a execução já autorizada, com a mesma mensagem.
      if m.cobranca_flow_id is not null then
        select status into fs from public.cobranca_flows where id=m.cobranca_flow_id and iniciado_em is not null for update;
      else
        select status into fs from public.acordo_flows where id=m.acordo_flow_id and iniciado_em is not null for update;
      end if;
      if fs is null or fs not in ('em_execucao','concluido_com_falhas') then continue; end if;
      if not exists(select 1 from public.carteiras where id=m.carteira_id and email_habilitado is distinct from false)
        or public.flow_cobranca_mensagem_elegivel(m) is not true
        or public.acordo_parcela_mensagem_elegivel(m) is not true then
        update public.email_tentativas set recuperada_em=now() where id=t.id;
        continue;
      end if;
      select count(*) into v_n from public.email_tentativas where mensagem_id=m.id;
      if v_n>=4 then
        update public.email_tentativas set recuperada_em=now() where id=t.id;
        continue;
      end if;
      begin
        v_slot:=public.email_reservar_horario(m.id,null,greatest(now(),t.finalizado_em)+
          case v_n when 1 then interval '5 minutes' when 2 then interval '15 minutes' else interval '60 minutes' end);
        if m.cobranca_flow_id is not null then
          update public.cobranca_flows set status='em_execucao',concluido_em=null where id=m.cobranca_flow_id;
        else
          update public.acordo_flows set status='em_execucao',concluido_em=null where id=m.acordo_flow_id;
        end if;
        update public.lote_itens set status='criado' where mensagem_id=m.id and status<>'enviado';
        update public.email_tentativas set recuperacao='repetir',recuperada_em=now() where id=t.id;
        v_reagendadas:=v_reagendadas+1;
      exception when others then
        -- Rollback do agendamento desta mensagem. Não insiste em configuração/vínculo inválido.
        get stacked diagnostics v_erro=message_text;
        update public.email_tentativas set recuperada_em=now() where id=t.id;
        insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,antes,depois)
          values(m.carteira_id,'mensagem',m.id,'email.recuperacao_bloqueada','Recuperação de e-mail exige revisão',v_old,
            jsonb_build_object('tentativa_id',t.id,'motivo',left(v_erro,500)));
        continue;
      end;
    else
      update public.email_tentativas set recuperada_em=now() where id=t.id;
      continue;
    end if;
    insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,antes,depois)
      values(m.carteira_id,'mensagem',m.id,'email.recuperacao_automatica','Resultado da recuperação segura de e-mail',v_old,
        jsonb_build_object('classificacao',v_class,'agendada_para',v_slot,'tentativa_id',t.id,'origem','email-dispatcher'));
    v_refs:=v_refs||jsonb_build_array(jsonb_build_object('lote_id',m.lote_id,'cobranca_flow_id',m.cobranca_flow_id,'acordo_flow_id',m.acordo_flow_id));
  end loop;
  return jsonb_build_object('reagendadas',v_reagendadas,'conferencia',v_conferencia,'referencias',v_refs);
end $$;

revoke all on function public.email_registrar_falha_smtp(uuid,text,boolean,text),public.email_recuperar_falhas_flows(integer,uuid) from public,anon,authenticated;
grant execute on function public.email_registrar_falha_smtp(uuid,text,boolean,text),public.email_recuperar_falhas_flows(integer,uuid) to service_role;

-- A classificação de incerteza histórica também bloqueia os caminhos manuais.
create function public.email_bloquear_agenda_conferencia() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.email_tentativas where mensagem_id=new.mensagem_id and recuperacao='conferencia') then
    raise exception 'Envio sem confirmação; confira o provedor antes de qualquer reenvio.';
  end if;
  return new;
end $$;
revoke all on function public.email_bloquear_agenda_conferencia() from public,anon,authenticated;
create trigger email_agenda_bloquear_conferencia before insert or update on public.email_agenda
  for each row execute function public.email_bloquear_agenda_conferencia();
notify pgrst,'reload schema';
commit;
