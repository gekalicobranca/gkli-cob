begin;
create or replace function public.flow_email_impedir_unidade_repetida()
returns trigger language plpgsql security invoker set search_path='' as $$
declare unidade uuid;
begin
  for unidade in select distinct c.unidade_id from public.mensagens m join public.cobrancas c on c.id=m.cobranca_id
    where m.lote_id=new.lote_id and m.canal='email' and m.status<>'cancelada' and c.unidade_id is not null order by c.unidade_id
  loop perform pg_advisory_xact_lock(9162027,hashtext(unidade::text)); end loop;
  if exists(select 1 from public.mensagens nova join public.cobrancas cn on cn.id=nova.cobranca_id
    join public.cobrancas ca on ca.unidade_id=cn.unidade_id
    join public.mensagens anterior on anterior.cobranca_id=ca.id
    join public.cobranca_flows f on f.id=anterior.cobranca_flow_id
    where nova.lote_id=new.lote_id and nova.canal='email' and nova.status<>'cancelada'
      and anterior.canal='email' and anterior.status in('pendente_aprovacao','aprovada','agendada')
      and anterior.carteira_id=new.carteira_id and f.regua_id=new.regua_id and f.id<>new.id
      and f.status in('pronto','em_execucao','pausado')
      and anterior.regua_etapa_id is not distinct from nova.regua_etapa_id
      and lower(trim(anterior.destinatario))=lower(trim(nova.destinatario))
      and coalesce(nullif(split_part(anterior.fingerprint,':',5),''),to_char(anterior.created_at at time zone 'America/Sao_Paulo','YYYY-MM'))
        =coalesce(nullif(split_part(nova.fingerprint,':',5),''),to_char(nova.created_at at time zone 'America/Sao_Paulo','YYYY-MM'))
  ) then raise exception 'A unidade já tem e-mail pendente nesta etapa e ciclo. Consolide as parcelas antes de criar outro Flow.' using errcode='23514'; end if;
  return new;
end $$;
create trigger flow_email_impedir_unidade_repetida before insert on public.cobranca_flows
  for each row execute function public.flow_email_impedir_unidade_repetida();

create or replace function public.mensagem_impedir_reenvio_confirmado()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.status is distinct from new.status and new.status in('pendente_aprovacao','aprovada','agendada') and (
    old.sent_at is not null or old.enviada_em is not null or old.enviado_em is not null or old.provider_message_id is not null
    or old.provider_status in('sent','delivered','read') or coalesce((old.payload->>'conferencia_envio')::boolean,false)
    or old.payload->>'consolidada_em' is not null
    or exists(select 1 from public.email_tentativas t where t.mensagem_id=old.id and t.estado in('em_envio','incerto','enviado'))
    or exists(select 1 from public.whatsapp_web_envios t where t.mensagem_id=old.id and t.estado in('reservado','incerto','enviado'))
  ) then raise exception 'Mensagem enviada ou aguardando conferência; reagendamento recusado para impedir reenvio.' using errcode='23514'; end if;
  return new;
end $$;
create trigger mensagem_impedir_reenvio_confirmado before update of status on public.mensagens
  for each row execute function public.mensagem_impedir_reenvio_confirmado();
revoke all on function public.flow_email_impedir_unidade_repetida(),public.mensagem_impedir_reenvio_confirmado() from public,anon,authenticated;
grant execute on function public.flow_email_impedir_unidade_repetida(),public.mensagem_impedir_reenvio_confirmado() to service_role;
commit;
