create table public.email_retornos (
 id uuid primary key default gen_random_uuid(), carteira_id uuid not null references public.carteiras(id),
 unidade_id uuid not null references public.unidades(id), destinatario text not null check(destinatario=lower(btrim(destinatario))),
 mensagem_chave text not null, recebido_em timestamptz not null, classificacao text not null check(classificacao in ('inexistente','temporaria','revisao')),
 codigo text, motivo text not null, outlook_url text not null, created_at timestamptz not null default now(),
 unique(carteira_id,mensagem_chave,destinatario)
);
create index email_retornos_bloqueio on public.email_retornos(carteira_id,destinatario) where classificacao='inexistente';
alter table public.email_retornos enable row level security;
create policy email_retornos_leitura on public.email_retornos for select to authenticated using(public.current_user_can_access_carteira(carteira_id));
grant select on public.email_retornos to authenticated;
grant all on public.email_retornos to service_role;
create function public.email_destino_invalido(p_carteira uuid,p_destino text) returns boolean language sql stable security invoker set search_path=public as $$
 select exists(select 1 from public.email_retornos where carteira_id=p_carteira and destinatario=lower(btrim(p_destino)) and classificacao='inexistente');
$$;
create function public.email_bloquear_destino_invalido() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.canal='email' and new.status in ('aprovada','agendada') and public.email_destino_invalido(new.carteira_id,coalesce(new.destinatario,new.email_destinatario)) then
  new.status:='cancelada'; new.status_operacional:='cancelada'; new.erro:='Endere√ßo inexistente confirmado por retorno de entrega; envio bloqueado.'; new.erro_envio:=new.erro;
 end if; return new;
end $$;
create trigger email_bloquear_destino_invalido before insert or update of status,destinatario,email_destinatario on public.mensagens for each row execute function public.email_bloquear_destino_invalido();
create function public.email_bloquear_thunderbird_invalido() returns trigger language plpgsql security invoker set search_path=public as $$
declare c uuid; destino text;
begin
 if new.estado in ('reservado','enviando') then
  select carteira_id into c from public.thunderbird_dispositivos where id=new.dispositivo_id;
  destino:=new.destinatario;
  if new.mensagem_id is not null then select coalesce(destinatario,email_destinatario) into destino from public.mensagens where id=new.mensagem_id; end if;
  if public.email_destino_invalido(c,destino) then raise exception 'Endere√ßo inexistente: envio bloqueado'; end if;
 end if; return new;
end $$;
create trigger email_bloquear_thunderbird_invalido before insert or update of estado on public.thunderbird_envios for each row execute function public.email_bloquear_thunderbird_invalido();
create function public.email_registrar_retorno(p_registro jsonb) returns uuid language plpgsql security invoker set search_path=public as $$
declare r public.email_retornos; resultado uuid;
begin
 r:=jsonb_populate_record(null::public.email_retornos,p_registro);
 if not exists(select 1 from public.unidades where id=r.unidade_id and carteira_id=r.carteira_id and lower(btrim(email))=lower(btrim(r.destinatario))) then raise exception 'Unidade fora da carteira'; end if;
 insert into public.email_retornos(carteira_id,unidade_id,destinatario,mensagem_chave,recebido_em,classificacao,codigo,motivo,outlook_url)
 values(r.carteira_id,r.unidade_id,lower(btrim(r.destinatario)),r.mensagem_chave,r.recebido_em,r.classificacao,r.codigo,r.motivo,r.outlook_url)
 on conflict(carteira_id,mensagem_chave,destinatario) do nothing returning id into resultado;
 if resultado is null then
  select id into resultado from public.email_retornos where carteira_id=r.carteira_id and mensagem_chave=r.mensagem_chave and destinatario=lower(btrim(r.destinatario)) and unidade_id=r.unidade_id and classificacao=r.classificacao and motivo=r.motivo and recebido_em=r.recebido_em and outlook_url=r.outlook_url and codigo is not distinct from r.codigo;
  if resultado is null then raise exception 'Retorno j· registrado com outro conte˙do; revisar sem sobrescrever evidÍncia'; end if;
 end if;
 if r.classificacao='inexistente' then
  update public.mensagens m set status='cancelada',status_operacional='cancelada',erro='Endere√ßo inexistente confirmado por retorno de entrega; envio bloqueado.',erro_envio='Endere√ßo inexistente confirmado por retorno de entrega; envio bloqueado.'
  where m.carteira_id=r.carteira_id and m.canal='email' and lower(btrim(coalesce(m.destinatario,m.email_destinatario)))=lower(btrim(r.destinatario)) and m.status in ('rascunho','pendente_aprovacao','aprovada','agendada','falha') and m.provider_message_id is null
   and not exists(select 1 from public.thunderbird_envios t where t.mensagem_id=m.id and t.estado in ('enviando','enviado','incerto'));
 end if; return resultado;
end $$;
revoke all on function public.email_registrar_retorno(jsonb) from public,anon,authenticated;
grant execute on function public.email_registrar_retorno(jsonb) to service_role;
revoke all on function public.email_destino_invalido(uuid,text) from public,anon;
grant execute on function public.email_destino_invalido(uuid,text) to authenticated,service_role;
