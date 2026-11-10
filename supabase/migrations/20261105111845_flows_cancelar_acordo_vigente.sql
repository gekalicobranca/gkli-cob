begin;

-- O acordo protege a unidade inteira, inclusive quando foi cadastrado apenas
-- por uma cobrança ou pela composição de cotas de um cadastro anterior.
create function public.flow_cobrancas_tem_acordo_vigente(p_ids uuid[])
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.cobrancas c
    where c.id = any(p_ids) and exists (
      select 1 from public.acordos a
      where a.status in ('ativo', 'em_dia', 'em_atraso') and (
        a.unidade_id = c.unidade_id or a.cobranca_id = c.id
        or exists (
          select 1 from public.cobrancas origem
          where origem.id = a.cobranca_id and origem.unidade_id = c.unidade_id
        )
        or exists (
          select 1 from public.acordo_cobrancas ac
          join public.cobrancas origem on origem.id = ac.cobranca_id
          where ac.acordo_id = a.id
            and (ac.cobranca_id = c.id or origem.unidade_id = c.unidade_id)
        )
      )
    )
  );
$$;

-- A montagem consulta as cotas em lote usando a mesma regra da progressão.
create function public.flow_cobrancas_bloqueadas_por_acordo(p_ids uuid[])
returns setof uuid language sql stable security invoker set search_path = '' as $$
  select c.id from public.cobrancas c
  where c.id = any(p_ids) and public.flow_cobrancas_tem_acordo_vigente(array[c.id]);
$$;

-- Limpeza limitada por execução. Mensagens consolidadas são canceladas por
-- inteiro porque o conteúdo congelado pode mencionar cotas do acordo.
create function public.flow_cobranca_cancelar_acordos_vigentes(p_ids uuid[] default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_m public.mensagens;
  v_job public.flow_progressao;
  v_antes jsonb;
  v_total integer := 0;
  v_motivo text := 'Cancelamento automático: unidade com acordo vigente.';
begin
  for v_m in
    select m.* from public.mensagens m
    where (m.contexto = 'cobranca' or m.cobranca_flow_id is not null)
      and m.acordo_id is null and m.acordo_flow_id is null and m.pre_juridico_flow_id is null
      and m.status in ('rascunho', 'pendente_aprovacao', 'aprovada', 'agendada', 'falha')
      and coalesce(m.sent_at, m.enviada_em, m.enviado_em) is null
      and m.provider_message_id is null
      and m.provider_status is distinct from 'sent'
      and m.provider_status is distinct from 'delivered'
      and m.provider_status is distinct from 'read'
      and not coalesce((m.payload->>'conferencia_envio')::boolean, false)
      and not public.mensagem_contem_cobranca_arquivada(m)
      and (p_ids is null or public.flow_progressao_ids(m) && p_ids)
      and public.flow_cobrancas_tem_acordo_vigente(public.flow_progressao_ids(m))
      and not exists (select 1 from public.email_tentativas e
        where e.mensagem_id = m.id and e.estado in ('em_envio', 'incerto', 'enviado'))
      and not exists (select 1 from public.whatsapp_web_envios e
        where e.mensagem_id = m.id and e.estado in ('reservado', 'incerto', 'enviado'))
    order by m.id limit case when p_ids is null then 25 else null end for update of m skip locked
  loop
    v_antes := jsonb_build_object('mensagem', to_jsonb(v_m),
      'itens', (select jsonb_agg(to_jsonb(i)) from public.lote_itens i where i.mensagem_id = v_m.id),
      'agenda', (select jsonb_agg(to_jsonb(a)) from public.email_agenda a where a.mensagem_id = v_m.id));
    perform public.flow_cancelar_mensagem(v_m.id);
    update public.mensagens set motivo_cancelamento = v_motivo, erro = v_motivo,
      cancelada_em = now(), agendada_para = null, scheduled_at = null, proxima_tentativa_em = null
      where id = v_m.id;
    insert into public.auditoria_eventos (carteira_id, entidade_tipo, entidade_id,
      evento_tipo, titulo, descricao, antes, depois)
    select v_m.carteira_id, 'mensagem', v_m.id, 'flow.cobranca_cancelada_acordo_vigente',
      'Cobrança cancelada por acordo vigente', v_motivo, v_antes, to_jsonb(m)
    from public.mensagens m where m.id = v_m.id;
    v_total := v_total + 1;
  end loop;

  for v_job in
    select p.* from public.flow_progressao p
    where p.status in ('pendente', 'processando', 'atencao')
      and (p_ids is null or p.cobranca_ids && p_ids)
      and public.flow_cobrancas_tem_acordo_vigente(p.cobranca_ids)
    order by p.prevista_em, p.id limit case when p_ids is null then 25 else null end for update of p skip locked
  loop
    v_antes := jsonb_build_object('progressao', to_jsonb(v_job),
      'lote', (select to_jsonb(l) from public.lotes l where l.id = v_job.lote_id),
      'itens', (select jsonb_agg(to_jsonb(i)) from public.lote_itens i where i.lote_id = v_job.lote_id));
    update public.flow_progressao set status = 'cancelado', erro = v_motivo,
      token = null, lease_ate = null, updated_at = now() where id = v_job.id;
    -- Somente o lote exclusivo desta continuação, sem mensagens em andamento.
    if not exists (select 1 from public.flow_progressao p
        where p.lote_id = v_job.lote_id and p.id <> v_job.id)
      and not exists (select 1 from public.mensagens m where m.lote_id = v_job.lote_id
        and m.status not in ('cancelada', 'enviada')) then
      update public.lote_itens set status = 'cancelado', cancelado_em = now(), motivo = v_motivo
        where lote_id = v_job.lote_id and status in ('criado', 'aprovado');
      update public.lotes set status = 'cancelado', cancelado_em = now(), motivo_cancelamento = v_motivo
        where id = v_job.lote_id and status in ('processando', 'pendente_aprovacao', 'aprovado');
    end if;
    insert into public.auditoria_eventos (carteira_id, entidade_tipo, entidade_id,
      evento_tipo, titulo, descricao, antes, depois)
    select v_job.carteira_id, 'flow_progressao', v_job.id, 'flow.continuacao_cancelada_acordo_vigente',
      'Continuação cancelada por acordo vigente', v_motivo, v_antes, to_jsonb(p)
    from public.flow_progressao p where p.id = v_job.id;
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

-- Preserva as demais proteções já instaladas, inclusive arquivamento e
-- parcelas de acordos. A assinatura e os privilégios das funções permanecem.
do $migration$
declare v_src text; v_anchor text;
begin
  v_src := pg_get_functiondef('public.flow_cobranca_mensagem_elegivel(public.mensagens)'::regprocedure);
  v_anchor := 'select public.acordo_parcela_mensagem_elegivel(m)';
  if position(v_anchor in v_src) = 0 then raise exception 'Elegibilidade incompatível'; end if;
  execute replace(v_src, v_anchor, v_anchor || E'\n and (m.acordo_id is not null or m.acordo_flow_id is not null or m.pre_juridico_flow_id is not null\n   or (m.contexto is distinct from ''cobranca'' and m.cobranca_flow_id is null)\n   or not public.flow_cobrancas_tem_acordo_vigente(public.flow_progressao_ids(m)))');

  v_src := pg_get_functiondef('public.flow_progressao_enfileirar()'::regprocedure);
  v_anchor := 'if not pg_try_advisory_xact_lock(9292026,1) then return 0; end if;';
  if position(v_anchor in v_src) = 0 then raise exception 'Enfileiramento incompatível'; end if;
  execute replace(v_src, v_anchor, v_anchor || E'\n perform public.flow_cobranca_cancelar_acordos_vigentes();');

  v_src := pg_get_functiondef('public.flow_progressao_finalizar(uuid,uuid,text)'::regprocedure);
  v_anchor := 'perform 1 from cobrancas where id=any(j.cobranca_ids) for update;';
  if position(v_anchor in v_src) = 0 then raise exception 'Finalização incompatível'; end if;
  execute replace(v_src, v_anchor, v_anchor || E'\n if public.flow_cobrancas_tem_acordo_vigente(j.cobranca_ids) then\n   perform public.flow_cobranca_cancelar_acordos_vigentes(j.cobranca_ids);\n   return null;\n end if;');
end;
$migration$;

revoke all on function public.flow_cobrancas_tem_acordo_vigente(uuid[]),
  public.flow_cobrancas_bloqueadas_por_acordo(uuid[]),
  public.flow_cobranca_cancelar_acordos_vigentes(uuid[]) from public, anon, authenticated;
grant execute on function public.flow_cobrancas_tem_acordo_vigente(uuid[]),
  public.flow_cobrancas_bloqueadas_por_acordo(uuid[]),
  public.flow_cobranca_cancelar_acordos_vigentes(uuid[]) to service_role;

notify pgrst, 'reload schema';
commit;
