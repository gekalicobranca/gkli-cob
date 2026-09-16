begin;

alter table public.carteiras add column if not exists email_limite_diario integer not null default 50
  check (email_limite_diario between 1 and 50);

create table public.email_agenda (
  mensagem_id uuid primary key references public.mensagens(id) on delete cascade,
  carteira_id uuid not null references public.carteiras(id),
  remetente text not null,
  agendada_para timestamptz not null
);
create index email_agenda_remetente_data on public.email_agenda(remetente,agendada_para);
create table public.email_tentativas (
  id uuid primary key default gen_random_uuid(),
  mensagem_id uuid references public.mensagens(id) on delete set null,
  carteira_id uuid not null references public.carteiras(id),
  remetente text not null,
  iniciado_em timestamptz not null default now(),
  estado text not null check (estado in ('em_envio','enviado','falha','incerto')),
  finalizado_em timestamptz
);
create index email_tentativas_cota on public.email_tentativas(remetente,iniciado_em);
alter table public.email_agenda enable row level security;
alter table public.email_tentativas enable row level security;
revoke all on public.email_agenda, public.email_tentativas from anon, authenticated;
grant all on public.email_agenda, public.email_tentativas to service_role;

-- A mesma trava serializa agenda e consumo, inclusive entre carteiras do mesmo domínio.
create function public.email_reservar_horario(p_mensagem uuid,p_remetente text,p_base timestamptz default now())
returns timestamptz language plpgsql security definer set search_path=public as $$
declare
  m public.mensagens; v_limit integer; v_at timestamptz; v_day date; v_start timestamptz; v_end timestamptz;
  v_count_c integer; v_count_r integer; v_conflict timestamptz;
begin
  perform pg_advisory_xact_lock(9162026,50);
  select * into strict m from public.mensagens where id=p_mensagem for update;
  if m.canal<>'email' or m.carteira_id is null or m.status not in ('pendente_aprovacao','aprovada','agendada','falha') then
    raise exception 'Mensagem não elegível para agenda de e-mail.';
  end if;
  if exists(select 1 from public.email_tentativas where mensagem_id=p_mensagem and estado in ('em_envio','enviado','incerto')) then
    raise exception 'Mensagem já enviada ou com tentativa que exige conferência antes do reenvio.';
  end if;
  if nullif(trim(p_remetente),'') is null then raise exception 'Remetente obrigatório.'; end if;
  select email_limite_diario into strict v_limit from public.carteiras where id=m.carteira_id;
  delete from public.email_agenda where mensagem_id=p_mensagem;
  v_at:=greatest(p_base,now());
  for i in 1..20000 loop
    v_day:=(v_at at time zone 'America/Sao_Paulo')::date;
    v_start:=(v_day+time '09:00') at time zone 'America/Sao_Paulo';
    v_end:=(v_day+time '18:00') at time zone 'America/Sao_Paulo';
    v_at:=greatest(v_at,v_start);
    if v_at>=v_end then v_at:=((v_day+1)+time '09:00') at time zone 'America/Sao_Paulo'; continue; end if;
    -- Tentativas SMTP consomem cota mesmo em falha. Reservas canceladas/pausadas não.
    select count(*) filter(where carteira_id=m.carteira_id),count(*) filter(where remetente=p_remetente)
      into v_count_c,v_count_r from (
        select a.carteira_id,a.remetente from public.email_agenda a join public.mensagens x on x.id=a.mensagem_id
        where a.agendada_para>=v_start and a.agendada_para<v_end and x.status='agendada'
        union all
        select t.carteira_id,t.remetente from public.email_tentativas t
        where (t.iniciado_em at time zone 'America/Sao_Paulo')::date=v_day
      ) q;
    if v_count_c>=v_limit or v_count_r>=50 then
      v_at:=((v_day+1)+time '09:00') at time zone 'America/Sao_Paulo'; continue;
    end if;
    select max(at) into v_conflict from (
      select a.agendada_para at from public.email_agenda a join public.mensagens x on x.id=a.mensagem_id
        where x.status='agendada' and (a.carteira_id=m.carteira_id or a.remetente=p_remetente)
      union all
      select t.iniciado_em from public.email_tentativas t where t.carteira_id=m.carteira_id or t.remetente=p_remetente
    ) q where at>v_at-interval '10 minutes' and at<v_at+interval '10 minutes';
    if v_conflict is not null then v_at:=v_conflict+interval '10 minutes'; continue; end if;
    insert into public.email_agenda values(p_mensagem,m.carteira_id,p_remetente,v_at);
    update public.mensagens set status='agendada',status_operacional='agendada',agendada_para=v_at,scheduled_at=v_at,
      proxima_tentativa_em=null,erro=null,erro_envio=null where id=p_mensagem;
    return v_at;
  end loop;
  raise exception 'Não foi possível reservar um horário.';
end $$;

create function public.email_ativar_flow(p_flow uuid,p_remetente text,p_usuario uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare f public.cobranca_flows; m record; v_count integer:=0; v_next timestamptz;
begin
  perform pg_advisory_xact_lock(9162026,50);
  select * into strict f from public.cobranca_flows where id=p_flow for update;
  if f.status not in ('pronto','pausado') then raise exception 'Flow não está pronto para ativação.'; end if;
  for m in select id,canal from public.mensagens where cobranca_flow_id=p_flow
    and status in ('pendente_aprovacao','aprovada','agendada','falha') order by created_at,id loop
    if m.canal='email' then
      perform public.email_reservar_horario(m.id,p_remetente);
    else
      update public.mensagens set status='agendada',status_operacional='agendada',agendada_para=now(),scheduled_at=now() where id=m.id;
    end if;
    update public.mensagens set aprovado_por=p_usuario,aprovado_em=now() where id=m.id;
    v_count:=v_count+1;
  end loop;
  if v_count=0 then raise exception 'Flow sem mensagens pendentes.'; end if;
  update public.lote_itens set status='aprovado',aprovado_em=now() where cobranca_flow_id=p_flow and status in ('criado','erro','aprovado');
  update public.lotes set status='aprovado',aprovado_por=p_usuario,aprovado_em=now() where id=f.lote_id;
  select min(agendada_para) into v_next from public.mensagens where cobranca_flow_id=p_flow and status='agendada';
  update public.cobranca_flows set status='em_execucao',iniciado_em=coalesce(iniciado_em,now()),pausado_em=null,
    atualizado_por=p_usuario,proximo_disparo_em=v_next,total_pendentes=0,total_agendadas=v_count where id=p_flow;
  return v_count;
end $$;

create function public.email_reservar_disparo(p_mensagem uuid,p_remetente text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m public.mensagens; a public.email_agenda; v_limit integer; v_now timestamptz:=clock_timestamp();
 v_day date; v_c integer; v_r integer; v_last timestamptz; v_slot timestamptz; v_id uuid;
begin
  perform pg_advisory_xact_lock(9162026,50);
  v_now:=clock_timestamp();
  select * into strict m from public.mensagens where id=p_mensagem for update;
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
  if v_c>=v_limit or v_r>=50 or v_last>v_now-interval '10 minutes'
    or (v_now at time zone 'America/Sao_Paulo')::time<time '09:00'
    or (v_now at time zone 'America/Sao_Paulo')::time>=time '18:00' then
    v_slot:=public.email_reservar_horario(p_mensagem,p_remetente,v_now);
    return jsonb_build_object('permitido',false,'agendada_para',v_slot,'motivo','Limite ou janela de envio.');
  end if;
  insert into public.email_tentativas(mensagem_id,carteira_id,remetente,iniciado_em,estado)
    values(p_mensagem,m.carteira_id,p_remetente,v_now,'em_envio') returning id into v_id;
  delete from public.email_agenda where mensagem_id=p_mensagem;
  return jsonb_build_object('permitido',true,'tentativa_id',v_id);
end $$;

create function public.email_finalizar_disparo(p_tentativa uuid,p_estado text)
returns void language plpgsql security definer set search_path=public as $$
declare v_mensagem uuid;
begin
  if p_estado not in ('enviado','falha','incerto') then raise exception 'Estado inválido.'; end if;
  update public.email_tentativas set estado=p_estado,finalizado_em=now() where id=p_tentativa and estado='em_envio' returning mensagem_id into v_mensagem;
  if p_estado='enviado' and v_mensagem is not null then
    update public.mensagens set status='enviada',status_operacional='enviada',enviada_em=now(),sent_at=now(),erro=null,erro_envio=null where id=v_mensagem;
    update public.lote_itens set status='enviado' where mensagem_id=v_mensagem;
  end if;
end $$;

revoke all on function public.email_reservar_horario(uuid,text,timestamptz),public.email_ativar_flow(uuid,text,uuid),
 public.email_reservar_disparo(uuid,text),public.email_finalizar_disparo(uuid,text) from public,anon,authenticated;
grant execute on function public.email_reservar_horario(uuid,text,timestamptz),public.email_ativar_flow(uuid,text,uuid),
 public.email_reservar_disparo(uuid,text),public.email_finalizar_disparo(uuid,text) to service_role;
create function public.email_consolidar_unidade(p_lote uuid,p_principal uuid,p_ids uuid[],p_conteudo text,p_payload jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  perform pg_advisory_xact_lock(9162026,50);
  perform 1 from public.mensagens where id=any(p_ids) for update;
  select count(*) into v_count from public.mensagens where id=any(p_ids) and lote_id=p_lote and canal='email' and status='pendente_aprovacao' and cobranca_flow_id is null;
  if v_count<>cardinality(p_ids) or not p_principal=any(p_ids) then raise exception 'Mensagens alteradas; atualize o lote.'; end if;
  update public.mensagens set conteudo=p_conteudo,conteudo_renderizado=p_conteudo,payload=p_payload where id=p_principal;
  update public.lote_itens set mensagem_id=p_principal where mensagem_id=any(p_ids);
  delete from public.mensagens where id=any(p_ids) and id<>p_principal;
  update public.lotes set total_criadas=(select count(*) from public.mensagens where lote_id=p_lote),total_pendentes=(select count(*) from public.mensagens where lote_id=p_lote and status='pendente_aprovacao') where id=p_lote;
end $$;
revoke all on function public.email_consolidar_unidade(uuid,uuid,uuid[],text,jsonb) from public,anon,authenticated;
grant execute on function public.email_consolidar_unidade(uuid,uuid,uuid[],text,jsonb) to service_role;
commit;
