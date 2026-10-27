begin;
-- A conta de cada reserva fica fixada no servidor, sem depender do payload.
alter table public.integracoes_smtp_config add column prioridade integer not null default 100 check(prioridade between 0 and 999);
update public.integracoes_smtp_config set prioridade=0;
create unique index integracoes_smtp_conta_carteira_uidx on public.integracoes_smtp_config(coalesce(carteira_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(trim(usuario))) where usuario is not null;
alter table public.email_agenda add column smtp_config_id uuid references public.integracoes_smtp_config(id);
create index email_agenda_smtp_config_idx on public.email_agenda(smtp_config_id);

create function public.email_smtp_candidatas(p_mensagem uuid)
returns table(config_id uuid,conta text,preferencia integer)
language plpgsql stable security invoker set search_path='' as $$
declare m public.mensagens; v_condominio uuid; v_outro uuid; r public.integracoes_smtp_rotas_condominio;
begin
 select * into strict m from public.mensagens where id=p_mensagem;
 if exists(select 1 from public.carteiras where id=m.carteira_id and email_transporte='thunderbird') then return; end if;
 if m.pre_juridico_flow_id is null and (m.cobranca_flow_id is not null or m.acordo_flow_id is not null) then
  if m.cobranca_id is not null then select condominio_id into strict v_condominio from public.cobrancas where id=m.cobranca_id and carteira_id=m.carteira_id; end if;
  if m.acordo_id is not null then
   select condominio_id into strict v_outro from public.acordos where id=m.acordo_id and carteira_id=m.carteira_id;
   if v_condominio is not null and v_condominio is distinct from v_outro then raise exception 'Mensagem vinculada a condomínios diferentes.'; end if;
   v_condominio:=v_outro;
  end if;
  if not exists(select 1 from public.condominios where id=v_condominio and carteira_id=m.carteira_id) then raise exception 'Condomínio fora da carteira de envio.'; end if;
  select * into r from public.integracoes_smtp_rotas_condominio where condominio_id=v_condominio;
  if found then
   if not r.ativo or r.carteira_id is distinct from m.carteira_id then raise exception 'Rota SMTP inativa ou fora da carteira.'; end if;
   return query select s.id,lower(trim(s.usuario)),s.prioridade from public.integracoes_smtp_config s where s.id=r.smtp_config_id and s.ativo;
   if not found then raise exception 'Conta SMTP específica do condomínio indisponível.'; end if;
   return;
  end if;
 end if;
 if exists(select 1 from public.integracoes_smtp_config s where s.carteira_id=m.carteira_id and s.ativo) then
  -- Avisos e mensagens avulsas conservam a conta principal. Flows usam o pool.
  return query select s.id,lower(trim(s.usuario)),s.prioridade from public.integracoes_smtp_config s
   where s.carteira_id=m.carteira_id and s.ativo order by s.prioridade,s.atualizado_em desc,s.id
   limit case when public.email_aviso_interno_autorizado(m) or (m.cobranca_flow_id is null and m.acordo_flow_id is null and m.pre_juridico_flow_id is null) then 1 else null end;
 else
  return query select s.id,lower(trim(s.usuario)),s.prioridade from public.integracoes_smtp_config s
   where s.carteira_id is null and s.ativo order by s.prioridade,s.atualizado_em desc,s.id limit 1;
 end if;
end $$;

-- Preserva a identidade das reservas que já existiam antes da segunda conta.
update public.email_agenda a set smtp_config_id=s.id from public.integracoes_smtp_config s,public.carteiras c
 where c.id=a.carteira_id and c.email_transporte='smtp' and s.ativo and s.carteira_id=a.carteira_id
 and lower(trim(s.usuario))=lower(trim(a.remetente));
update public.email_agenda a set smtp_config_id=r.smtp_config_id
 from public.mensagens m left join public.cobrancas co on co.id=m.cobranca_id left join public.acordos ac on ac.id=m.acordo_id
 join public.integracoes_smtp_rotas_condominio r on r.condominio_id=coalesce(co.condominio_id,ac.condominio_id) and r.ativo
 join public.integracoes_smtp_config s on s.id=r.smtp_config_id and s.ativo
 where m.id=a.mensagem_id and r.carteira_id=m.carteira_id and lower(trim(s.usuario))=lower(trim(a.remetente));
update public.email_agenda a set smtp_config_id=s.id from public.integracoes_smtp_config s,public.carteiras c
 where c.id=a.carteira_id and c.email_transporte='smtp' and a.smtp_config_id is null and s.ativo and s.carteira_id is null
 and lower(trim(s.usuario))=lower(trim(a.remetente));

create function public.email_smtp_config_envio(p_mensagem uuid) returns uuid
language plpgsql stable security invoker set search_path='' as $$
declare v_id uuid; v_conta text; v_agendada text;
begin
 select smtp_config_id,remetente into v_id,v_agendada from public.email_agenda where mensagem_id=p_mensagem;
 if v_id is not null then
  select conta into v_conta from public.email_smtp_candidatas(p_mensagem) c where c.config_id=v_id;
  if not found or v_conta is distinct from lower(trim(v_agendada)) then raise exception 'Conta SMTP da reserva inativa ou fora do escopo autorizado. Reagende a mensagem antes de enviar.'; end if;
 else
  select c.config_id into v_id from public.email_smtp_candidatas(p_mensagem) c order by c.preferencia,c.config_id limit 1;
 end if;
 if v_id is null then raise exception 'Nenhuma conta SMTP ativa para a mensagem.'; end if;
 return v_id;
end $$;

create or replace function public.email_conta_envio(p_mensagem uuid) returns text
language plpgsql stable security invoker set search_path='' as $$
declare m public.mensagens; v_conta text;
begin
 select * into strict m from public.mensagens where id=p_mensagem;
 if exists(select 1 from public.carteiras where id=m.carteira_id and email_transporte='thunderbird') then
  select email into strict v_conta from public.thunderbird_dispositivos where carteira_id=m.carteira_id and ativo;
 else
  select usuario into strict v_conta from public.integracoes_smtp_config where id=public.email_smtp_config_envio(p_mensagem);
 end if;
 v_conta:=lower(trim(v_conta));
 if v_conta is null or v_conta !~ '^[^[:space:]@<>;,]+@[^[:space:]@<>;,]+[.][^[:space:]@<>;,]+$' then raise exception 'Conta autenticada de e-mail não identificada.'; end if;
 return v_conta;
end $$;

create function public.email_proximo_horario_conta(m public.mensagens,p_conta text,p_base timestamptz) returns timestamptz
language plpgsql stable security invoker set search_path='' as $$
declare v_limit int; v_at timestamptz; v_day date; v_start timestamptz; v_end timestamptz; v_c int; v_r int; v_conflict timestamptz; v_interno boolean;
begin
 select email_limite_diario into strict v_limit from public.carteiras where id=m.carteira_id;
 v_interno:=public.email_aviso_interno_autorizado(m);
 v_at:=greatest(p_base,now());
 for i in 1..30000 loop
  if not v_interno and public.email_liberacao_imediata_autorizada(m,v_at) is not true then
   v_at:=public.email_proximo_horario_noturno(to_timestamp(ceil(extract(epoch from v_at)/120)*120));
  end if;
  v_day:=(v_at at time zone 'America/Sao_Paulo')::date;
  v_start:=v_day::timestamp at time zone 'America/Sao_Paulo'; v_end:=(v_day+1)::timestamp at time zone 'America/Sao_Paulo';
  select count(*) filter(where carteira_id=m.carteira_id),count(*) into v_c,v_r from(
   select a.carteira_id from public.email_agenda a join public.mensagens x on x.id=a.mensagem_id
    where a.mensagem_id<>m.id and a.agendada_para>=v_start and a.agendada_para<v_end and x.status='agendada' and a.remetente=p_conta
   union all select t.carteira_id from public.email_tentativas t where t.iniciado_em>=v_start and t.iniciado_em<v_end
    and (coalesce(t.conta_envio,t.remetente)=p_conta or(t.conta_envio is null and t.remetente=split_part(p_conta,'@',2)))
  ) q;
  if v_c>=v_limit or v_r>=100 then v_at:=v_end; continue; end if;
  if not v_interno then
   select max(at) into v_conflict from(
    select a.agendada_para at from public.email_agenda a join public.mensagens x on x.id=a.mensagem_id where a.mensagem_id<>m.id and x.status='agendada' and a.remetente=p_conta
    union all select t.iniciado_em from public.email_tentativas t where coalesce(t.conta_envio,t.remetente)=p_conta or(t.conta_envio is null and t.remetente=split_part(p_conta,'@',2))
   ) q where at>v_at-interval '2 minutes' and at<v_at+interval '2 minutes';
   if v_conflict is not null then v_at:=v_conflict+interval '2 minutes'; continue; end if;
  end if;
  return v_at;
 end loop;
 raise exception 'Não foi possível reservar um horário de e-mail.';
end $$;

create or replace function public.email_reservar_horario(p_mensagem uuid,p_remetente text,p_base timestamptz default now()) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare m public.mensagens; c record; v_slot timestamptz; v_best timestamptz; v_config uuid; v_conta text;
begin
 perform pg_advisory_xact_lock(9162026,50);
 select * into strict m from public.mensagens where id=p_mensagem for update;
 if m.canal<>'email' or m.carteira_id is null or m.status not in('pendente_aprovacao','aprovada','agendada','falha') then raise exception 'Mensagem não elegível para agenda de e-mail.'; end if;
 if exists(select 1 from public.email_tentativas where mensagem_id=p_mensagem and estado in('em_envio','enviado','incerto')) then raise exception 'Mensagem já enviada ou com tentativa que exige conferência antes do reenvio.'; end if;
 if exists(select 1 from public.carteiras where id=m.carteira_id and email_transporte='thunderbird') then
  v_conta:=public.email_conta_envio(p_mensagem);
  v_best:=public.email_proximo_horario_conta(m,v_conta,p_base);
 else
  for c in select * from public.email_smtp_candidatas(p_mensagem) order by preferencia,config_id loop
   if c.conta is null or c.conta !~ '^[^[:space:]@<>;,]+@[^[:space:]@<>;,]+[.][^[:space:]@<>;,]+$' then raise exception 'Conta autenticada de e-mail não identificada.'; end if;
   v_slot:=public.email_proximo_horario_conta(m,c.conta,p_base);
   if v_best is null or v_slot<v_best then v_best:=v_slot; v_config:=c.config_id; v_conta:=c.conta; end if;
  end loop;
  if v_best is null then raise exception 'Nenhuma conta SMTP ativa para a mensagem.'; end if;
 end if;
 delete from public.email_agenda where mensagem_id=p_mensagem;
 insert into public.email_agenda(mensagem_id,carteira_id,remetente,agendada_para,smtp_config_id) values(p_mensagem,m.carteira_id,v_conta,v_best,v_config);
 update public.mensagens set status='agendada',status_operacional='agendada',agendada_para=v_best,scheduled_at=v_best,proxima_tentativa_em=null,erro=null,erro_envio=null where id=p_mensagem;
 return v_best;
end $$;

revoke all on function public.email_smtp_candidatas(uuid),public.email_smtp_config_envio(uuid),public.email_conta_envio(uuid),public.email_proximo_horario_conta(public.mensagens,text,timestamptz),public.email_reservar_horario(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.email_smtp_candidatas(uuid),public.email_smtp_config_envio(uuid),public.email_conta_envio(uuid),public.email_proximo_horario_conta(public.mensagens,text,timestamptz),public.email_reservar_horario(uuid,text,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;

