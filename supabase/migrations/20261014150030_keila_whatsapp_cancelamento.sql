begin;
create function public.keila_cancelar_whatsapp(p_caso uuid,p_mensagem uuid,p_usuario uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare c public.central_pendencias; m public.mensagens; em timestamptz:=now();
begin
 select * into strict c from central_pendencias where id=p_caso and tipo='keila_atendimento' for update;
 select * into strict m from mensagens where id=p_mensagem and carteira_id=c.carteira_id and canal='whatsapp' and payload->>'keila_caso_id'=c.id::text for update;
 if c.payload#>>'{rascunho_whatsapp,liberacao,mensagem_id}' is distinct from m.id::text then raise exception 'Mensagem não corresponde ao envio deste atendimento.'; end if;
 if m.status='cancelada' then return; end if;
 if m.status not in ('agendada','falha') or m.provider_message_id is not null or m.provider_status in ('reservado','incerto','enviado') or exists(select 1 from whatsapp_web_envios where mensagem_id=m.id and estado in ('reservado','incerto','enviado')) then
 raise exception 'Envio iniciado, concluído ou incerto; conferir antes de qualquer ação.';
 end if;
 update mensagens set status='cancelada',status_operacional='cancelada',cancelado_por=p_usuario,cancelado_em=em,motivo_cancelamento='Cancelamento solicitado na fila da Keila.' where id=m.id;
 update central_pendencias set payload=c.payload||jsonb_build_object('proxima_acao','WhatsApp cancelado antes do envio. Versão e autorização preservadas; não reenviar automaticamente.','atividades',coalesce(c.payload->'atividades','[]'::jsonb)||jsonb_build_array(jsonb_build_object('em',em,'usuario_id',p_usuario,'descricao','WhatsApp '||m.id||' cancelado na fila antes do início do envio.'))),descricao='WhatsApp cancelado antes do envio. Versão e autorização preservadas.',updated_at=em where id=c.id;
end $$;
revoke all on function public.keila_cancelar_whatsapp(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.keila_cancelar_whatsapp(uuid,uuid,uuid) to service_role;
commit;
