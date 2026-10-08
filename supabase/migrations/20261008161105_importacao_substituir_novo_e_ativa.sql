begin;
create or replace function public.importacao_substituir_cobrancas_anteriores(p_importacao uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  imp public.importacoes;
  ids uuid[];
  flows uuid[];
  mensagens_ids uuid[];
  snapshot jsonb;
  dependencias jsonb := '{}'::jsonb;
  dados jsonb;
  fk record;
  removidas integer := 0;
  canceladas integer := 0;
  itens integer := 0;
begin
  select * into strict imp from public.importacoes where id=p_importacao for update;
  if imp.tipo <> 'cobrancas' then raise exception 'Importação de cobranças obrigatória.'; end if;
  if imp.status = 'confirmada' then raise exception 'Importação já concluída.'; end if;
  if imp.carteira_id is null then raise exception 'Carteira obrigatória para substituir cobranças.'; end if;
  -- O relatório pode ser parcial ou conter linhas inválidas. A limpeza usa somente
  -- os condomínios identificados pelas linhas válidas da carteira da importação.
  if not exists(select 1 from public.importacao_itens i where i.importacao_id=p_importacao and i.valido
    and i.payload->>'carteira_id'=imp.carteira_id::text and nullif(i.payload->>'condominio_id','') is not null) then
    raise exception 'Nenhum condomínio válido da carteira foi identificado para a substituição.';
  end if;
  -- FOR UPDATE impede novos vínculos por FK enquanto a remoção é validada.
  perform c.id from public.cobrancas c where exists(
    select 1 from public.importacao_itens i where i.importacao_id=p_importacao and i.valido
      and i.payload->>'condominio_id'=c.condominio_id::text and i.payload->>'carteira_id'=c.carteira_id::text)
    order by c.id for update;
  select coalesce(array_agg(c.id),'{}'::uuid[]) into ids from public.cobrancas c
  where c.carteira_id=imp.carteira_id and c.duplicada_de_id is null and c.status_operacional in ('novo','em_cobranca_ativa')
    and (imp.resumo->>'somente_ano_corrente'='false' or extract(year from c.vencimento)=extract(year from now() at time zone 'America/Sao_Paulo'))
    and exists(select 1 from public.importacao_itens i where i.importacao_id=p_importacao and i.valido
      and i.payload->>'condominio_id'=c.condominio_id::text and i.payload->>'carteira_id'=c.carteira_id::text)
    and not exists(select 1 from public.acordos a where a.cobranca_id=c.id)
    and not exists(select 1 from public.acordo_cobrancas a where a.cobranca_id=c.id)
    and not exists(select 1 from public.cobrancas d where d.duplicada_de_id=c.id);
  if cardinality(ids)=0 then return jsonb_build_object('removidas',0,'ids','[]'::jsonb,'mensagens_canceladas',0,'itens_removidos',0); end if;

  select jsonb_agg(to_jsonb(c)) into snapshot from public.cobrancas c where id=any(ids);
  -- Guarda os registros que uma FK CASCADE pode apagar, antes de qualquer alteração.
  for fk in select n.nspname as schema_name,t.relname as table_name,a.attname as column_name
    from pg_catalog.pg_constraint f join pg_catalog.pg_class t on t.oid=f.conrelid
    join pg_catalog.pg_namespace n on n.oid=t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=t.oid and a.attnum=f.conkey[1]
    where f.contype='f' and f.confrelid='public.cobrancas'::regclass loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from %I.%I t where %I=any($1)',fk.schema_name,fk.table_name,fk.column_name) into dados using ids;
    dependencias := dependencias || jsonb_build_object(fk.table_name,dados);
  end loop;
  select coalesce(array_agg(m.id),'{}'::uuid[]) into mensagens_ids from public.mensagens m
    where m.cobranca_id=any(ids) or exists(select 1 from jsonb_array_elements_text(coalesce(m.payload->'cobranca_ids','[]'::jsonb)) v where v::uuid=any(ids));
  select coalesce(array_agg(distinct f),'{}'::uuid[]) into flows from (
    select cobranca_flow_id as f from public.mensagens where id=any(mensagens_ids)
    union select cobranca_flow_id from public.lote_itens where cobranca_id=any(ids)
    union select id from public.cobranca_flows where exists(select 1 from jsonb_array_elements_text(coalesce(payload->'cobranca_ids','[]'::jsonb)) v where v::uuid=any(ids))
  ) q where f is not null;
  dependencias := dependencias || jsonb_build_object(
    'mensagens_consolidadas',coalesce((select jsonb_agg(to_jsonb(m)) from public.mensagens m where id=any(mensagens_ids)),'[]'::jsonb),
    'flows',coalesce((select jsonb_agg(to_jsonb(f)) from public.cobranca_flows f where id=any(flows)),'[]'::jsonb),
    'progressao',coalesce((select jsonb_agg(to_jsonb(p)) from public.flow_progressao p where cobranca_ids && ids),'[]'::jsonb),
    'montagens',coalesce((select jsonb_agg(to_jsonb(m)) from public.maestro_flow_montagens m where exists(select 1 from jsonb_array_elements(coalesce(m.plano,'[]'::jsonb)) grupo cross join lateral jsonb_array_elements_text(grupo) v where v::uuid=any(ids))),'[]'::jsonb),
    'pendencias',coalesce((select jsonb_agg(to_jsonb(p)) from public.central_pendencias p where cobranca_id=any(ids) or (entidade_tipo='cobranca' and entidade_id=any(ids))),'[]'::jsonb));
  -- Uma mensagem consolidada não pode continuar com o total anterior renderizado.
  update public.mensagens set status='cancelada',status_operacional='cancelada',cancelado_em=now(),
    cancelada_em=now(),agendada_para=null,scheduled_at=null,
    motivo_cancelamento='Cobrança substituída pela importação: '||p_importacao::text
    where id=any(mensagens_ids) and status not in ('enviada','cancelada');
  get diagnostics canceladas = row_count;
  update public.mensagens m set payload=jsonb_set(coalesce(payload,'{}'::jsonb),'{cobranca_ids}',
    coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(m.payload->'cobranca_ids','[]'::jsonb)) v where not v::uuid=any(ids)),'[]'::jsonb))
    where id=any(mensagens_ids) and payload ? 'cobranca_ids';
  update public.flow_progressao p set cobranca_ids=array(select v from unnest(p.cobranca_ids) v where not v=any(ids)),
    status=case when status in ('pendente','processando','atencao') then 'cancelado' else status end,
    token=null,lease_ate=null,erro='Débito substituído pela importação; continuação cancelada.',updated_at=now()
    where cobranca_ids && ids;
  update public.maestro_flow_montagens m set plano=(select jsonb_agg(coalesce((select jsonb_agg(v) from jsonb_array_elements_text(grupo) v where not v::uuid=any(ids)),'[]'::jsonb)) from jsonb_array_elements(m.plano) grupo),
    status=case when status='processando' then 'atencao' else status end,token=null,lease_ate=null,updated_at=now()
    where exists(select 1 from jsonb_array_elements(coalesce(m.plano,'[]'::jsonb)) grupo cross join lateral jsonb_array_elements_text(grupo) v where v::uuid=any(ids));
  select count(*) into itens from public.lote_itens where cobranca_id=any(ids);
  update public.central_pendencias set status='resolvida',resolvido_em=now(),payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object('resolucao','Cobrança substituída pela importação','importacao_id',p_importacao)
    where (cobranca_id=any(ids) or (entidade_tipo='cobranca' and entidade_id=any(ids))) and status in ('aberta','em_tratamento');
  delete from public.cobrancas where id=any(ids);
  get diagnostics removidas = row_count;
  update public.cobranca_flows f set payload=jsonb_set(coalesce(f.payload,'{}'::jsonb),'{cobranca_ids}',
    coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(f.payload->'cobranca_ids','[]'::jsonb)) v where not v::uuid=any(ids)),'[]'::jsonb)),
    total_mensagens=(select count(*) from public.mensagens where cobranca_flow_id=f.id),
    total_pendentes=(select count(*) from public.mensagens where cobranca_flow_id=f.id and status in ('pendente_aprovacao','aprovada')),
    total_agendadas=(select count(*) from public.mensagens where cobranca_flow_id=f.id and status='agendada'),
    total_enviadas=(select count(*) from public.mensagens where cobranca_flow_id=f.id and status='enviada'),
    total_falhas=(select count(*) from public.mensagens where cobranca_flow_id=f.id and status='falha'),
    proximo_disparo_em=(select min(coalesce(agendada_para,scheduled_at)) from public.mensagens where cobranca_flow_id=f.id and status='agendada'),
    status=case when not exists(select 1 from public.lote_itens where cobranca_flow_id=f.id) then 'cancelado' else f.status end,
    cancelado_em=case when not exists(select 1 from public.lote_itens where cobranca_flow_id=f.id) then now() else f.cancelado_em end
    where id=any(flows);
  insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,descricao,antes,depois)
    values(imp.carteira_id,'importacao',p_importacao,'importacao.anteriores_substituidas','Cobranças anteriores substituídas',
      'Substituição de cobranças Novo/Cobrança ativa sem acordo antes da nova carga, incluindo flows.',
      jsonb_build_object('cobrancas',snapshot,'dependencias',dependencias),
      jsonb_build_object('ids',ids,'removidas',removidas,'mensagens_canceladas',canceladas,'itens_removidos',itens));
  return jsonb_build_object('removidas',removidas,'ids',ids,'mensagens_canceladas',canceladas,'itens_removidos',itens);
end $$;
revoke all on function public.importacao_substituir_cobrancas_anteriores(uuid) from public,anon,authenticated;
grant execute on function public.importacao_substituir_cobrancas_anteriores(uuid) to service_role;
commit;
