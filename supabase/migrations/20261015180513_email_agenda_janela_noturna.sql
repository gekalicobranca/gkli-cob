begin;

-- A janela cruza a meia-noite; 06:00 é o limite exclusivo.
create or replace function public.email_janela_noturna(p_at timestamptz)
returns boolean language sql immutable strict parallel safe set search_path='' as $$
 select (p_at at time zone 'America/Sao_Paulo')::time >= time '22:00'
     or (p_at at time zone 'America/Sao_Paulo')::time < time '06:00';
$$;

create or replace function public.email_proximo_horario_noturno(p_at timestamptz)
returns timestamptz language sql immutable strict parallel safe set search_path='' as $$
 select case when public.email_janela_noturna(p_at) then p_at
 else (((p_at at time zone 'America/Sao_Paulo')::date + time '22:00') at time zone 'America/Sao_Paulo') end;
$$;

create or replace function public.email_reservar_horario(p_mensagem uuid,p_remetente text,p_base timestamptz default now())
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
  -- Slots alinhados ao cron evitam reservas após o último tick da madrugada.
  v_at:=public.email_proximo_horario_noturno(to_timestamp(ceil(extract(epoch from v_at)/600)*600));
  v_day:=(v_at at time zone 'America/Sao_Paulo')::date;
  v_start:=(v_day+time '00:00') at time zone 'America/Sao_Paulo';
  v_end:=((v_day+1)+time '00:00') at time zone 'America/Sao_Paulo';
  -- As cotas continuam sendo por dia civil de Brasília, não por noite.
  select count(*) filter(where carteira_id=m.carteira_id),count(*) filter(where remetente=p_remetente)
  into v_count_c,v_count_r from (
   select a.carteira_id,a.remetente from public.email_agenda a join public.mensagens x on x.id=a.mensagem_id
    where a.agendada_para>=v_start and a.agendada_para<v_end and x.status='agendada'
   union all
   select t.carteira_id,t.remetente from public.email_tentativas t where t.iniciado_em>=v_start and t.iniciado_em<v_end
  ) q;
  if v_count_c>=v_limit or v_count_r>=50 then v_at:=v_end; continue; end if;
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

-- Preserva todas as validações vigentes de elegibilidade, cota e transporte.
do $migration$
declare src text; anchor text; old_window text; j record;
begin
 src:=replace(pg_get_functiondef('public.email_reservar_disparo_interno(uuid,text)'::regprocedure),E'\r\n',E'\n');
 old_window:=E'(v_now at time zone ''America/Sao_Paulo'')::time<time ''09:00''\n    or (v_now at time zone ''America/Sao_Paulo'')::time>=time ''18:00''';
 if position(old_window in src)=0 then raise exception 'Janela atual de disparo inesperada.'; end if;
 src:=replace(src,old_window,'not public.email_janela_noturna(v_now)');
 anchor:='v_now:=clock_timestamp();';
 if position(anchor in src)=0 then raise exception 'Âncora da reserva de disparo ausente.'; end if;
 execute replace(src,anchor,anchor||E'\n  if not public.email_janela_noturna(v_now) then return jsonb_build_object(''permitido'',false,''agendada_para'',public.email_proximo_horario_noturno(v_now),''motivo'',''Envios de e-mail somente entre 22h e 06h (Brasília).''); end if;');

 src:=replace(pg_get_functiondef('public.email_processar_agenda()'::regprocedure),E'\r\n',E'\n');
 anchor:=E'begin\n';
 if position(anchor in src)=0 then raise exception 'Âncora do cron de e-mail ausente.'; end if;
 execute replace(src,anchor,anchor||E'  if not public.email_janela_noturna(clock_timestamp()) then return null; end if;\n');

 src:=pg_get_functiondef('public.thunderbird_reservar(uuid,boolean)'::regprocedure);
 anchor:='for m in select x.* from mensagens x join email_agenda a on a.mensagem_id=x.id';
 if position(anchor in src)=0 then raise exception 'Âncora da fila Thunderbird ausente.'; end if;
 execute replace(src,anchor,E'if not public.email_janela_noturna(clock_timestamp()) then return null; end if;\n '||anchor);

 src:=pg_get_functiondef('public.thunderbird_iniciar(uuid,uuid)'::regprocedure);
 anchor:='if e.tipo=''fila'' then';
 if position(anchor in src)=0 then raise exception 'Âncora do início Thunderbird ausente.'; end if;
 execute replace(src,anchor,anchor||E'\n  if not public.email_janela_noturna(clock_timestamp()) then return false; end if;');

 -- 22h-06h de Brasília corresponde a 01h-09h UTC, com 09h exclusiva.
 for j in select jobid from cron.job where jobname='gkli-email-agenda' loop
  perform cron.alter_job(j.jobid,schedule:='*/10 1-8 * * *');
 end loop;
end $migration$;

revoke all on function public.email_janela_noturna(timestamptz),public.email_proximo_horario_noturno(timestamptz) from public,anon,authenticated;
grant execute on function public.email_janela_noturna(timestamptz),public.email_proximo_horario_noturno(timestamptz) to service_role;

notify pgrst,'reload schema';
commit;
