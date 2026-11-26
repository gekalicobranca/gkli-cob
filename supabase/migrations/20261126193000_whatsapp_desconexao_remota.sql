begin;
-- Metadata only. Existing session/attempt/message history and RLS remain unchanged.
alter table public.whatsapp_worker_controles
  add column if not exists desconectar_id uuid,
  add column if not exists desconectado_id uuid;
comment on column public.whatsapp_worker_controles.desconectar_id is 'Pedido administrativo de limpeza do vínculo da sessão no volume Railway. Não autoriza envio.';
comment on column public.whatsapp_worker_controles.desconectado_id is 'Último pedido de limpeza concluído pelo serviço da própria sessão.';

-- Preserve the installed financial/route/quota rules, adding a per-session pause
-- gate that shares the row lock with the administrative disconnect command.
alter function public.whatsapp_web_reservar(text,text) rename to whatsapp_web_reservar_antes_railway;
create function public.whatsapp_web_reservar(p_sessao text,p_numero text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.whatsapp_worker_controles;
begin
  select * into c from public.whatsapp_worker_controles where sessao=p_sessao for update;
  if not found or not c.habilitado or (c.desconectar_id is not null and c.desconectar_id is distinct from c.desconectado_id) then return null; end if;
  return public.whatsapp_web_reservar_antes_railway(p_sessao,p_numero);
end $$;
revoke all on function public.whatsapp_web_reservar(text,text),public.whatsapp_web_reservar_antes_railway(text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_web_reservar(text,text),public.whatsapp_web_reservar_antes_railway(text,text) to service_role;

create function public.whatsapp_solicitar_desconexao(p_sessao text,p_usuario uuid,p_pedido uuid)
returns void language plpgsql security definer set search_path='' as $$
declare c public.whatsapp_worker_controles;
begin
  select * into strict c from public.whatsapp_worker_controles where sessao=p_sessao for update;
  if exists(select 1 from public.whatsapp_web_envios where sessao=p_sessao and estado='reservado') then
    raise exception 'Existe envio em andamento. Pause a conexão e aguarde o resultado antes de limpar o vínculo.';
  end if;
  if c.desconectar_id=p_pedido then return; end if;
  update public.whatsapp_worker_controles set habilitado=false,reiniciar_id=p_pedido,desconectar_id=p_pedido,
    vinculacao_pedido=null,vinculacao_modo=null,vinculacao_payload=null,vinculacao_expira_em=null,
    solicitado_por=p_usuario,atualizado_em=now() where sessao=p_sessao;
  insert into public.auditoria_eventos(entidade_tipo,entidade_id,evento_tipo,titulo,usuario_id,antes,depois)
    values('whatsapp_sessao',p_pedido,'whatsapp.desconexao_solicitada','Desconexão da linha solicitada',p_usuario,
      jsonb_build_object('sessao',p_sessao,'habilitado',c.habilitado),
      jsonb_build_object('sessao',p_sessao,'habilitado',false,'pedido',p_pedido,'historico_preservado',true));
end $$;

create function public.whatsapp_concluir_desconexao(p_sessao text,p_pedido uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare c public.whatsapp_worker_controles;
begin
  select * into strict c from public.whatsapp_worker_controles where sessao=p_sessao for update;
  if c.desconectar_id is distinct from p_pedido or c.desconectado_id=p_pedido then return false; end if;
  insert into public.whatsapp_web_sessoes(id,numero,status,atualizado_em) values(p_sessao,null,'desconectado',now())
    on conflict(id) do update set numero=null,status='desconectado',atualizado_em=now();
  update public.whatsapp_worker_controles set desconectado_id=p_pedido,aplicado_id=reiniciar_id,
    vinculacao_payload=null,vinculacao_expira_em=null where sessao=p_sessao;
  insert into public.auditoria_eventos(entidade_tipo,entidade_id,evento_tipo,titulo,usuario_id,depois)
    values('whatsapp_sessao',p_pedido,'whatsapp.desconexao_aplicada','Vínculo da linha limpo no serviço remoto',c.solicitado_por,
      jsonb_build_object('sessao',p_sessao,'pedido',p_pedido,'historico_preservado',true));
  return true;
end $$;

revoke all on function public.whatsapp_solicitar_desconexao(text,uuid,uuid),public.whatsapp_concluir_desconexao(text,uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_solicitar_desconexao(text,uuid,uuid),public.whatsapp_concluir_desconexao(text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
