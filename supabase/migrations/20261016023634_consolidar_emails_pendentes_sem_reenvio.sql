begin;
create or replace function public.flow_cobranca_recontar(p_flow uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare total integer; pendentes integer; agendadas integer; enviadas integer; falhas integer; proximo timestamptz;
begin
  perform 1 from public.cobranca_flows where id=p_flow for update;
  select count(*),count(*) filter(where status in('pendente_aprovacao','aprovada')),
    count(*) filter(where status='agendada'),count(*) filter(where status='enviada'),count(*) filter(where status='falha'),
    min(coalesce(agendada_para,scheduled_at)) filter(where status='agendada')
    into total,pendentes,agendadas,enviadas,falhas,proximo from public.mensagens where cobranca_flow_id=p_flow;
  update public.cobranca_flows set total_mensagens=total,total_pendentes=pendentes,total_agendadas=agendadas,
    total_enviadas=enviadas,total_falhas=falhas,proximo_disparo_em=proximo,updated_at=now(),
    status=case when status in('cancelado','pausado') then status
      when pendentes+agendadas=0 then case when falhas>0 then 'concluido_com_falhas' else 'concluido' end
      when status='pronto' then status else 'em_execucao' end
  where id=p_flow;
end $$;

create or replace function public.email_consolidar_pendentes(p_principal uuid,p_ids uuid[],p_conteudo text,p_payload jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare principal public.mensagens; unidade uuid; esperado uuid[]; informado uuid[]; f uuid; quantidade integer;
begin
  if cardinality(p_ids)<2 or not p_principal=any(p_ids) or nullif(trim(p_conteudo),'') is null then raise exception 'Seleção de consolidação inválida.'; end if;
  perform pg_advisory_xact_lock(9162026,50);
  perform 1 from public.cobranca_flows where id in(select cobranca_flow_id from public.mensagens where id=any(p_ids)) order by id for update;
  perform 1 from public.mensagens where id=any(p_ids) order by id for update;
  if (select count(*) from public.mensagens where id=any(p_ids))<>cardinality(p_ids) then raise exception 'Mensagens ausentes ou repetidas.'; end if;
  select * into strict principal from public.mensagens where id=p_principal;
  select unidade_id into strict unidade from public.cobrancas where id=principal.cobranca_id;
  if principal.cobranca_flow_id is null or unidade is null then raise exception 'Mensagem sem Flow ou unidade.'; end if;
  if exists(select 1 from public.mensagens m left join public.cobrancas c on c.id=m.cobranca_id
    left join public.cobranca_flows fl on fl.id=m.cobranca_flow_id where m.id=any(p_ids) and (
      m.canal<>'email' or m.status not in('pendente_aprovacao','aprovada','agendada')
      or coalesce(m.status_operacional,m.status) not in('pendente_aprovacao','aprovada','agendada')
      or m.sent_at is not null or m.enviada_em is not null or m.enviado_em is not null or m.provider_message_id is not null
      or m.carteira_id is distinct from principal.carteira_id or c.unidade_id is distinct from unidade
      or m.regua_etapa_id is distinct from principal.regua_etapa_id
      or coalesce(nullif(split_part(m.fingerprint,':',5),''),to_char(m.created_at at time zone 'America/Sao_Paulo','YYYY-MM'))
        is distinct from coalesce(nullif(split_part(principal.fingerprint,':',5),''),to_char(principal.created_at at time zone 'America/Sao_Paulo','YYYY-MM'))
      or lower(trim(m.destinatario)) is distinct from lower(trim(principal.destinatario))
      or fl.regua_id is distinct from (select regua_id from public.cobranca_flows where id=principal.cobranca_flow_id)
      or fl.status not in('pronto','em_execucao','pausado') or fl.id is null
      or coalesce(m.payload->'keila_anexos','[]'::jsonb)<>'[]'::jsonb
      or exists(select 1 from public.email_tentativas t where t.mensagem_id=m.id and t.estado in('em_envio','incerto','enviado'))
    )) then raise exception 'Mensagens alteradas, enviadas ou sem confirmação; consolidação recusada.'; end if;
  select array_agg(distinct id order by id) into esperado from (
    select cobranca_id id from public.mensagens where id=any(p_ids)
    union select value::uuid from public.mensagens m cross join lateral jsonb_array_elements_text(coalesce(m.payload->'cobranca_ids','[]'::jsonb)) where m.id=any(p_ids)
    union select cobranca_id from public.lote_itens where mensagem_id=any(p_ids)
  ) x where id is not null;
  select array_agg(distinct value::uuid order by value::uuid) into informado from jsonb_array_elements_text(p_payload->'cobranca_ids');
  if esperado is distinct from informado then raise exception 'A consolidação deve preservar todas as parcelas.'; end if;
  if exists(select 1 from public.lote_itens where mensagem_id=any(p_ids) and status='enviado') then raise exception 'Item já enviado; consolidação recusada.'; end if;
  update public.mensagens set conteudo=p_conteudo,conteudo_renderizado=p_conteudo,payload=p_payload where id=p_principal;
  insert into public.mensagem_anexos(mensagem_id,documento_id,ordem)
    select p_principal,a.documento_id,min(a.ordem) from public.mensagem_anexos a where a.mensagem_id=any(p_ids)
    and not exists(select 1 from public.mensagem_anexos b where b.mensagem_id=p_principal and b.documento_id=a.documento_id)
    group by a.documento_id;
  update public.lote_itens set mensagem_id=p_principal,lote_id=principal.lote_id,cobranca_flow_id=principal.cobranca_flow_id
    where mensagem_id=any(p_ids) and mensagem_id<>p_principal;
  delete from public.email_agenda where mensagem_id=any(p_ids) and mensagem_id<>p_principal;
  update public.mensagens set status='cancelada',status_operacional='cancelada',cancelada_em=now(),cancelado_em=now(),
    motivo_cancelamento='Consolidada na mensagem '||p_principal,erro='Consolidada na mensagem '||p_principal,
    payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object('consolidada_em',p_principal)
    where id=any(p_ids) and id<>p_principal;
  for f in select distinct cobranca_flow_id from public.mensagens where id=any(p_ids) loop perform public.flow_cobranca_recontar(f); end loop;
  return cardinality(p_ids)-1;
end $$;
revoke all on function public.flow_cobranca_recontar(uuid),public.email_consolidar_pendentes(uuid,uuid[],text,jsonb) from public,anon,authenticated;
grant execute on function public.flow_cobranca_recontar(uuid),public.email_consolidar_pendentes(uuid,uuid[],text,jsonb) to service_role;
commit;
