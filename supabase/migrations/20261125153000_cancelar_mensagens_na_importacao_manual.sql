create function public.limpar_lote_importacao_manual(p_ids uuid[], p_ano integer, p_status text[])
returns jsonb
language plpgsql
set search_path = ''
set statement_timeout = '45s'
as $$
declare
  ids uuid[];
  mensagens_ids uuid[];
  protegidas uuid[];
  removidas integer;
  mensagem uuid;
begin
  -- Serializa a exclusão com novos vínculos e confere novamente o recorte.
  perform c.id from public.cobrancas c where c.id=any(p_ids) order by c.id for update;
  select array(select c.id from public.cobrancas c
    where c.id=any(p_ids) and c.arquivada_em is null and c.duplicada_de_id is null
      and c.status_operacional=any(p_status)
      and c.vencimento>=make_date(p_ano,1,1) and c.vencimento<make_date(p_ano+1,1,1)
      and not exists(select 1 from public.acordos a where a.cobranca_id=c.id)
      and not exists(select 1 from public.acordo_cobrancas a where a.cobranca_id=c.id)
    order by c.id) into ids;

  if cardinality(ids)=0 then
    return jsonb_build_object('removidas',0,'retidas_por_envio',0);
  end if;

  -- O transportador também trava a mensagem ao assumir seu envio.
  select array(select m.id from public.mensagens m
    where m.cobranca_id=any(ids) or (m.payload->'cobranca_ids') ?| ids::text[]
    order by m.id for update) into mensagens_ids;

  with em_transporte as materialized (
    select m.cobranca_id,m.payload from public.mensagens m
    where m.id=any(mensagens_ids) and (
      m.status in ('em_envio','enviando','incerto')
      or m.status_operacional in ('em_envio','enviando','incerto')
      or exists(select 1 from public.email_tentativas t where t.mensagem_id=m.id and t.estado in ('em_envio','incerto'))
      or exists(select 1 from public.thunderbird_envios t where t.mensagem_id=m.id and t.estado in ('reservado','enviando','incerto'))
      or exists(select 1 from public.whatsapp_web_envios t where t.mensagem_id=m.id and t.estado in ('reservado','incerto'))
    )
  )
  select array(select c.id from unnest(ids) c(id)
    where exists(select 1 from em_transporte m
      where m.cobranca_id=c.id or (m.payload->'cobranca_ids') ? c.id::text))
  into protegidas;

  select array(select id from unnest(ids) t(id) where not (id=any(protegidas))) into ids;
  for mensagem in select m.id from public.mensagens m
    where m.id=any(mensagens_ids)
      and (m.cobranca_id=any(ids) or (m.payload->'cobranca_ids') ?| ids::text[])
      and m.status in ('rascunho','pendente_aprovacao','aprovada','agendada','falha')
    order by m.id
  loop
    perform public.flow_cancelar_mensagem(mensagem);
  end loop;

  -- A FK de mensagens é CASCADE. Desvincular mantém o histórico do Flow.
  update public.mensagens set cobranca_id=null where cobranca_id=any(ids);
  update public.saneamento_cobrancas set cobranca_id=null where cobranca_id=any(ids);
  delete from public.cobrancas where id=any(ids);
  get diagnostics removidas=row_count;
  if removidas<>cardinality(ids) then
    raise exception 'A substituição das cobranças anteriores não foi concluída.';
  end if;
  return jsonb_build_object('removidas',removidas,'retidas_por_envio',cardinality(protegidas));
end;
$$;

revoke all on function public.limpar_lote_importacao_manual(uuid[],integer,text[]) from public,anon,authenticated;
grant execute on function public.limpar_lote_importacao_manual(uuid[],integer,text[]) to service_role;
notify pgrst, 'reload schema';
