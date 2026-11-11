begin;

create function public.whatsapp_consolidar_unidade(p_lote uuid,p_principal uuid,p_ids uuid[],p_conteudo text,p_payload jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare m public.mensagens; unidade uuid; destino text; n integer; charge_ids uuid[];
begin
  if cardinality(p_ids)<2 or not p_principal=any(p_ids) or nullif(trim(p_conteudo),'') is null then
    raise exception 'Grupo inválido para consolidação.';
  end if;
  -- Lock in the same order for competing consolidators. The dispatcher locks
  -- each message before reserving, so an in-flight send cannot be changed.
  perform 1 from mensagens where id=any(p_ids) order by id for update;
  select * into strict m from mensagens where id=p_principal;
  select unidade_id into unidade from cobrancas where id=m.cobranca_id;
  destino := regexp_replace(m.destinatario,'\D','','g');
  if length(destino) in (10,11) then destino:='55'||destino; end if;
  select count(*) into n from mensagens x join cobrancas c on c.id=x.cobranca_id
  where x.id=any(p_ids) and x.lote_id=p_lote and x.canal='whatsapp'
    and x.status=m.status and x.status in ('pendente_aprovacao','aprovada','agendada')
    and x.carteira_id=m.carteira_id and c.unidade_id=unidade and unidade is not null
    and x.cobranca_flow_id is not distinct from m.cobranca_flow_id
    and x.acordo_flow_id is null and x.pre_juridico_flow_id is null
    and x.provider_message_id is null and coalesce((x.payload->>'total_cobrancas')::int,1)=1
    and case when length(regexp_replace(x.destinatario,'\D','','g')) in (10,11)
      then '55'||regexp_replace(x.destinatario,'\D','','g') else regexp_replace(x.destinatario,'\D','','g') end=destino
    and not exists(select 1 from whatsapp_web_envios e where e.mensagem_id=x.id);
  if n<>cardinality(p_ids) then raise exception 'Mensagens alteradas ou com tentativa de envio; atualize o lote.'; end if;
  select array_agg(distinct cobranca_id order by cobranca_id) into charge_ids from mensagens where id=any(p_ids);
  if cardinality(charge_ids)<>n or
    charge_ids is distinct from array(select value::uuid from jsonb_array_elements_text(p_payload->'cobranca_ids') order by value::uuid)
    or (p_payload->>'total_cobrancas')::int is distinct from n then
    raise exception 'Cobranças representadas divergentes.';
  end if;
  insert into mensagem_anexos(mensagem_id,documento_id,ordem)
    select p_principal,documento_id,min(ordem) from mensagem_anexos where mensagem_id=any(p_ids)
    group by documento_id on conflict(mensagem_id,documento_id) do nothing;
  update mensagens set conteudo=p_conteudo,conteudo_renderizado=p_conteudo,payload=p_payload where id=p_principal;
  update lote_itens set mensagem_id=p_principal where mensagem_id=any(p_ids);
  if m.cobranca_flow_id is null then
    -- Match the email preparation path, whose finalizers expect only pending rows.
    delete from mensagens where id=any(p_ids) and id<>p_principal;
  else
    update mensagens set status='cancelada',status_operacional='cancelada',
      erro=null,erro_envio=null,payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object('consolidada_em',p_principal)
      where id=any(p_ids) and id<>p_principal;
    update cobranca_flows f set
      total_pendentes=(select count(*) from mensagens where cobranca_flow_id=f.id and status in ('pendente_aprovacao','aprovada')),
      total_agendadas=(select count(*) from mensagens where cobranca_flow_id=f.id and status='agendada'),
      proximo_disparo_em=(select min(agendada_para) from mensagens where cobranca_flow_id=f.id and status='agendada'),
      updated_at=now() where f.id=m.cobranca_flow_id;
  end if;
  update lotes set total_criadas=(select count(*) from mensagens where lote_id=p_lote and status<>'cancelada'),
    total_pendentes=(select count(*) from mensagens where lote_id=p_lote and status in ('pendente_aprovacao','aprovada','agendada')) where id=p_lote;
  insert into mensageria_logs(mensagem_id,carteira_id,evento,descricao,payload)
    values(p_principal,m.carteira_id,'whatsapp_unidade_consolidada','Cobranças da mesma unidade consolidadas em uma mensagem de WhatsApp.',
      jsonb_build_object('mensagens_origem',p_ids,'cobranca_ids',charge_ids,'total_cobrancas',n));
end $$;
revoke all on function public.whatsapp_consolidar_unidade(uuid,uuid,uuid[],text,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_consolidar_unidade(uuid,uuid,uuid[],text,jsonb) to service_role;
commit;
