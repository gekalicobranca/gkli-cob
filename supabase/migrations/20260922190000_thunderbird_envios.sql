begin;
alter table public.carteiras add column email_transporte text not null default 'smtp' check (email_transporte in ('smtp','thunderbird'));
create table public.thunderbird_dispositivos (
 id uuid primary key default gen_random_uuid(), carteira_id uuid not null references public.carteiras(id),
 email text not null, token_hash text not null unique, ativo boolean not null default true,
 automatico boolean not null default false, testado_em timestamptz, visto_em timestamptz,
 criado_em timestamptz not null default now()
);
create unique index thunderbird_carteira_ativa on public.thunderbird_dispositivos(carteira_id) where ativo;
create table public.thunderbird_envios (
 id uuid primary key default gen_random_uuid(), dispositivo_id uuid not null references public.thunderbird_dispositivos(id),
 mensagem_id uuid unique references public.mensagens(id), tentativa_id uuid references public.email_tentativas(id),
 tipo text not null check(tipo in ('teste','fila')), destinatario text, assunto text, corpo text,
 estado text not null default 'pendente' check(estado in ('pendente','reservado','enviando','enviado','falha','incerto')),
 recibo text, erro text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
alter table public.thunderbird_dispositivos enable row level security;
alter table public.thunderbird_envios enable row level security;
revoke all on public.thunderbird_dispositivos,public.thunderbird_envios from anon,authenticated;
grant all on public.thunderbird_dispositivos,public.thunderbird_envios to service_role;

-- Preserve the full existing agenda/eligibility implementation, including its locks.
alter function public.email_reservar_disparo(uuid,text) rename to email_reservar_disparo_interno;
create function public.email_reservar_disparo(p_mensagem uuid,p_remetente text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(9162026,50);
 if exists(select 1 from mensagens m join carteiras c on c.id=m.carteira_id where m.id=p_mensagem and c.email_transporte='thunderbird') then
  return jsonb_build_object('permitido',false,'motivo','Envio reservado ao Thunderbird local.');
 end if;
 return email_reservar_disparo_interno(p_mensagem,p_remetente);
end $$;

create function public.thunderbird_reservar(p_dispositivo uuid,p_somente_teste boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
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
end $$;

create function public.thunderbird_iniciar(p_dispositivo uuid,p_envio uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare d thunderbird_dispositivos; e thunderbird_envios; m mensagens;
begin
 perform pg_advisory_xact_lock(9162026,50);
 select * into strict d from thunderbird_dispositivos where id=p_dispositivo for update;
 select * into strict e from thunderbird_envios where id=p_envio and dispositivo_id=d.id for update;
 if not d.ativo or e.estado<>'reservado' then return false; end if;
 if e.tipo='fila' then
  select * into strict m from mensagens where id=e.mensagem_id for update;
  if not d.automatico or m.status<>'agendada' or not flow_cobranca_mensagem_elegivel(m)
   or not exists(select 1 from carteiras where id=d.carteira_id and email_transporte='thunderbird' and email_habilitado is distinct from false)
   or (m.cobranca_flow_id is not null and not exists(select 1 from cobranca_flows where id=m.cobranca_flow_id and status='em_execucao'))
   or (m.acordo_flow_id is not null and not exists(select 1 from acordo_flows where id=m.acordo_flow_id and status='em_execucao')) then
   return false;
  end if;
 end if;
 update thunderbird_envios set estado='enviando',atualizado_em=now() where id=e.id;
 return true;
end $$;

create function public.thunderbird_concluir(p_dispositivo uuid,p_envio uuid,p_estado text,p_recibo text default null,p_erro text default null)
returns void language plpgsql security definer set search_path=public as $$
declare e thunderbird_envios;
begin
 perform pg_advisory_xact_lock(9162026,50);
 select * into strict e from thunderbird_envios where id=p_envio and dispositivo_id=p_dispositivo for update;
 if p_estado not in ('enviado','falha','incerto') then raise exception 'Estado inválido'; end if;
 if e.estado=p_estado then return; end if;
 if e.estado not in ('reservado','enviando') then raise exception 'Envio já concluído'; end if;
 if p_estado='enviado' and e.estado<>'enviando' then raise exception 'Envio não iniciado'; end if;
 update thunderbird_envios set estado=p_estado,recibo=left(p_recibo,500),erro=left(p_erro,500),atualizado_em=now() where id=e.id;
 if e.tentativa_id is not null then perform email_finalizar_disparo(e.tentativa_id,p_estado); end if;
 if e.mensagem_id is not null then
  update mensagens set provider='thunderbird',provider_status=p_estado,provider_message_id=left(p_recibo,500),
   ultima_tentativa_em=now(),tentativas_envio=coalesce(tentativas_envio,0)+1,
   erro=case when p_estado='enviado' then null else left(p_erro,500) end,
   erro_envio=case when p_estado='enviado' then null else left(p_erro,500) end
   where id=e.mensagem_id;
 end if;
 if e.tipo='teste' and p_estado='enviado' then update thunderbird_dispositivos set testado_em=now() where id=p_dispositivo; end if;
end $$;

create function public.thunderbird_modo(p_dispositivo uuid,p_automatico boolean)
returns void language plpgsql security definer set search_path=public as $$
declare d thunderbird_dispositivos;
begin
 perform pg_advisory_xact_lock(9162026,50);
 select * into strict d from thunderbird_dispositivos where id=p_dispositivo for update;
 if not d.ativo or (p_automatico and d.testado_em is null) then raise exception 'Conclua o teste antes de ativar a fila'; end if;
 update thunderbird_dispositivos set automatico=p_automatico where id=d.id;
 -- Pausing retains the transport, preventing another dispatcher from sending.
 update carteiras set email_transporte='thunderbird' where id=d.carteira_id;
end $$;
revoke all on function public.email_reservar_disparo(uuid,text),public.thunderbird_reservar(uuid,boolean),public.thunderbird_iniciar(uuid,uuid),public.thunderbird_concluir(uuid,uuid,text,text,text),public.thunderbird_modo(uuid,boolean) from public,anon,authenticated;
grant execute on function public.email_reservar_disparo(uuid,text),public.thunderbird_reservar(uuid,boolean),public.thunderbird_iniciar(uuid,uuid),public.thunderbird_concluir(uuid,uuid,text,text,text),public.thunderbird_modo(uuid,boolean) to service_role;
commit;
