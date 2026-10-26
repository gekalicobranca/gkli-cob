begin;
alter table public.carteiras drop constraint carteiras_email_limite_diario_check;
alter table public.carteiras add constraint carteiras_email_limite_diario_check check(email_limite_diario between 1 and 100);
alter table public.carteiras alter column email_limite_diario set default 100;
-- Mantém o agrupamento histórico original e registra a conta real em coluna própria.
alter table public.email_tentativas add column conta_envio text;
create index email_tentativas_conta_iniciado_idx on public.email_tentativas(conta_envio,iniciado_em);

create function public.email_conta_envio(p_mensagem uuid) returns text
language plpgsql stable security invoker set search_path='' as $$
declare m public.mensagens; v_transport text; v_condominio uuid; v_conta text; v_config uuid; v_rota public.integracoes_smtp_rotas_condominio;
begin
 select * into strict m from public.mensagens where id=p_mensagem;
 select email_transporte into strict v_transport from public.carteiras where id=m.carteira_id;
 if v_transport='thunderbird' then
  select email into strict v_conta from public.thunderbird_dispositivos where carteira_id=m.carteira_id and ativo;
 else
  if m.pre_juridico_flow_id is null and (m.cobranca_flow_id is not null or m.acordo_flow_id is not null) then
   if m.cobranca_id is not null then select condominio_id into strict v_condominio from public.cobrancas where id=m.cobranca_id and carteira_id=m.carteira_id;
   elsif m.acordo_id is not null then select condominio_id into strict v_condominio from public.acordos where id=m.acordo_id and carteira_id=m.carteira_id; end if;
   if not exists(select 1 from public.condominios where id=v_condominio and carteira_id=m.carteira_id) then raise exception 'Condomínio fora da carteira de envio.'; end if;
   select * into v_rota from public.integracoes_smtp_rotas_condominio where condominio_id=v_condominio;
   if found then
    if not v_rota.ativo or v_rota.carteira_id is distinct from m.carteira_id then raise exception 'Rota SMTP inativa ou fora da carteira.'; end if;
    v_config:=v_rota.smtp_config_id;
    select usuario into strict v_conta from public.integracoes_smtp_config where id=v_config and ativo;
   end if;
  end if;
  if v_config is null then
   select usuario into v_conta from public.integracoes_smtp_config where carteira_id=m.carteira_id and ativo order by atualizado_em desc limit 1;
   if not found then select usuario into v_conta from public.integracoes_smtp_config where carteira_id is null and ativo order by atualizado_em desc limit 1; end if;
  end if;
 end if;
 v_conta:=lower(trim(v_conta));
 if v_conta is null or v_conta !~ '^[^[:space:]@<>;,]+@[^[:space:]@<>;,]+[.][^[:space:]@<>;,]+$' then raise exception 'Conta autenticada de e-mail não identificada.'; end if;
 return v_conta;
end $$;
revoke all on function public.email_conta_envio(uuid) from public,anon,authenticated;
grant execute on function public.email_conta_envio(uuid) to service_role;

-- A classificação das tentativas de hoje usa a rota administrativa e preserva remetente.
-- Se a conta não puder ser confirmada, o domínio legado continua contando conservadoramente.
do $backfill$
declare r record; v_conta text;
begin
 for r in select id,mensagem_id,remetente from public.email_tentativas where conta_envio is null and iniciado_em>=((now() at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo') loop
  begin
   if position('@' in r.remetente)>0 then v_conta:=lower(trim(r.remetente));
   else v_conta:=public.email_conta_envio(r.mensagem_id); if lower(trim(r.remetente)) is distinct from split_part(v_conta,'@',2) then v_conta:=null; end if; end if;
   if v_conta is not null then update public.email_tentativas set conta_envio=v_conta where id=r.id; end if;
  exception when no_data_found or too_many_rows or raise_exception then null;
  end;
 end loop;
end $backfill$;

create or replace function public.email_reservar_horario(p_mensagem uuid,p_remetente text,p_base timestamptz default now())
returns timestamptz language plpgsql security definer set search_path='public' as $$
declare m public.mensagens; v_limit int; v_at timestamptz; v_day date; v_start timestamptz; v_end timestamptz; v_c int; v_r int; v_conflict timestamptz; v_interno boolean;
begin
 perform pg_advisory_xact_lock(9162026,50);
 select * into strict m from public.mensagens where id=p_mensagem for update;
 if m.canal<>'email' or m.carteira_id is null or m.status not in('pendente_aprovacao','aprovada','agendada','falha') then raise exception 'Mensagem não elegível para agenda de e-mail.'; end if;
 if exists(select 1 from public.email_tentativas where mensagem_id=p_mensagem and estado in('em_envio','enviado','incerto')) then raise exception 'Mensagem já enviada ou com tentativa que exige conferência antes do reenvio.'; end if;
 p_remetente:=public.email_conta_envio(p_mensagem);
 select email_limite_diario into strict v_limit from public.carteiras where id=m.carteira_id;
 v_interno:=public.email_aviso_interno_autorizado(m);
 delete from public.email_agenda where mensagem_id=p_mensagem;
 v_at:=greatest(p_base,now());
 for i in 1..30000 loop
  if not v_interno and public.email_liberacao_imediata_autorizada(m,v_at) is not true then
   v_at:=public.email_proximo_horario_noturno(to_timestamp(ceil(extract(epoch from v_at)/120)*120));
  end if;
  v_day:=(v_at at time zone 'America/Sao_Paulo')::date;
  v_start:=v_day::timestamp at time zone 'America/Sao_Paulo';
  v_end:=(v_day+1)::timestamp at time zone 'America/Sao_Paulo';
  select count(*) filter(where carteira_id=m.carteira_id),count(*) into v_c,v_r from(
   select a.carteira_id from public.email_agenda a join public.mensagens x on x.id=a.mensagem_id
    where a.agendada_para>=v_start and a.agendada_para<v_end and x.status='agendada' and a.remetente=p_remetente
   union all select t.carteira_id from public.email_tentativas t where t.iniciado_em>=v_start and t.iniciado_em<v_end
    and (coalesce(t.conta_envio,t.remetente)=p_remetente or(t.conta_envio is null and t.remetente=split_part(p_remetente,'@',2)))
  ) q;
  if v_c>=v_limit or v_r>=100 then v_at:=v_end; continue; end if;
  if not v_interno then
   select max(at) into v_conflict from(
    select a.agendada_para at from public.email_agenda a join public.mensagens x on x.id=a.mensagem_id where x.status='agendada' and a.remetente=p_remetente
    union all select t.iniciado_em from public.email_tentativas t where coalesce(t.conta_envio,t.remetente)=p_remetente or(t.conta_envio is null and t.remetente=split_part(p_remetente,'@',2))
   ) q where at>v_at-interval '2 minutes' and at<v_at+interval '2 minutes';
   if v_conflict is not null then v_at:=v_conflict+interval '2 minutes'; continue; end if;
  end if;
  insert into public.email_agenda(mensagem_id,carteira_id,remetente,agendada_para)values(p_mensagem,m.carteira_id,p_remetente,v_at);
  update public.mensagens set status='agendada',status_operacional='agendada',agendada_para=v_at,scheduled_at=v_at,proxima_tentativa_em=null,erro=null,erro_envio=null where id=p_mensagem;
  return v_at;
 end loop;
 raise exception 'Não foi possível reservar um horário de e-mail.';
end $$;
revoke all on function public.email_reservar_horario(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.email_reservar_horario(uuid,text,timestamptz) to service_role;

-- Preserva todas as travas financeiras, de aprovação, pausa e idempotência existentes.
do $dispatch$
declare src text; anchor text; replacement text; at int;
begin
 src:=pg_get_functiondef('public.email_reservar_disparo_interno(uuid,text)'::regprocedure);
 anchor:='select * into strict m from public.mensagens where id=p_mensagem for update;';
 at:=position(anchor in src); if at=0 then raise exception 'Reserva final de e-mail mudou.'; end if;
 replacement:=anchor||$new$
  declare v_conta text:=public.email_conta_envio(p_mensagem); begin
   if lower(trim(p_remetente)) is distinct from v_conta and lower(trim(p_remetente)) is distinct from split_part(v_conta,'@',2) then raise exception 'Conta autenticada diverge da conta autorizada para a mensagem.'; end if;
   p_remetente:=v_conta;
  end;
$new$;
 src:=overlay(src placing replacement from at for length(anchor));
 anchor:='from public.email_tentativas where (iniciado_em at time zone ''America/Sao_Paulo'')::date=v_day;';
 if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 then raise exception 'Contagem de tentativas mudou.'; end if;
 src:=replace(src,'count(*) filter(where remetente=p_remetente)','count(*)');
 src:=replace(src,'max(iniciado_em) filter(where carteira_id=m.carteira_id or remetente=p_remetente)','max(iniciado_em)');
 src:=replace(src,anchor,'from public.email_tentativas where (iniciado_em at time zone ''America/Sao_Paulo'')::date=v_day and (coalesce(conta_envio,remetente)=p_remetente or(conta_envio is null and remetente=split_part(p_remetente,''@'',2)));');
 if position('v_r>=50' in src)=0 or position('interval ''10 minutes''' in src)=0 then raise exception 'Cota ou intervalo final mudou.'; end if;
 src:=replace(replace(src,'v_r>=50','v_r>=100'),'interval ''10 minutes''','interval ''2 minutes''');
 src:=replace(src,'insert into public.email_tentativas(mensagem_id,carteira_id,remetente,iniciado_em,estado)','insert into public.email_tentativas(mensagem_id,carteira_id,remetente,conta_envio,iniciado_em,estado)');
 src:=replace(src,'values(p_mensagem,m.carteira_id,p_remetente,v_now,''em_envio'')','values(p_mensagem,m.carteira_id,p_remetente,p_remetente,v_now,''em_envio'')');
 execute src;

 src:=pg_get_functiondef('public.thunderbird_reservar(uuid,boolean)'::regprocedure);
 anchor:='split_part(lower(d.email),''@'',2)';
 if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 then raise exception 'Conta Thunderbird mudou.'; end if;
 execute replace(src,anchor,'lower(trim(d.email))');
end $dispatch$;

do $cron$
declare j bigint;
begin
 select jobid into j from cron.job where jobname='gkli-email-agenda';
 if j is not null then perform cron.alter_job(j,schedule:='*/2 1-8 * * *'); end if;
end $cron$;
notify pgrst,'reload schema';
commit;
