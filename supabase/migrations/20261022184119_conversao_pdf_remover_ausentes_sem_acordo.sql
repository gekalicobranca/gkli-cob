begin;
create or replace function public.conversao_remover_cobrancas_ausentes(p_conversao uuid, p_condominio uuid, p_carteira uuid, p_importadas jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  conv public.conversoes_relatorio;
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
  resultado jsonb;
begin
  select * into strict conv from public.conversoes_relatorio where id=p_conversao for update;
  if (conv.condominio_id is not null and conv.condominio_id<>p_condominio)
     or (conv.carteira_id is not null and conv.carteira_id<>p_carteira)
     or not exists(select 1 from public.condominios where id=p_condominio and carteira_id=p_carteira) then
    raise exception 'Conversão fora do condomínio/carteira informado.';
  end if;
  if coalesce(conv.preview_json->>'tipoConversao','')<>'cobrancas'
     or coalesce(conv.preview_json->>'arquivo','') !~* '\.pdf$' then
    raise exception 'Conversão PDF de cobranças obrigatória.';
  end if;
  if conv.preview_json->>'relatorioCompleto'='false' or conv.preview_json->>'parcial'='true'
     or coalesce(conv.preview_json->>'recorteRegua','todos')<>'todos'
     or jsonb_typeof(conv.preview_json->'cobrancas') is distinct from 'array'
     or jsonb_typeof(p_importadas) is distinct from 'array' then
    return jsonb_build_object('removidas',0,'motivo','Captação incompleta: nenhuma ausência removida.');
  end if;
  if jsonb_array_length(p_importadas)=0
     or jsonb_array_length(p_importadas)<>jsonb_array_length(conv.preview_json->'cobrancas') then
    return jsonb_build_object('removidas',0,'motivo','Captação incompleta: nenhuma ausência removida.');
  end if;
  if exists(select 1 from jsonb_array_elements(p_importadas) i
    where nullif(i->>'unidade_id','') is null or nullif(i->>'vencimento','') is null
      or not exists(select 1 from public.unidades u where u.id=(i->>'unidade_id')::uuid and u.condominio_id=p_condominio)) then
    raise exception 'Linha sem vencimento ou fora do condomínio.';
  end if;
  -- Uma conversão já concluída não pode usar um snapshot antigo para uma nova limpeza.
  if conv.status in ('concluido','concluido_com_alertas') then
    return jsonb_build_object('removidas',0,'motivo','Conversão já concluída; limpeza não repetida.');
  end if;
  if conv.preview_json ? 'limpezaAusentesPdf' then
    return jsonb_build_object('removidas',0,'ja_processada',true);
  end if;
  -- Serializa captações concorrentes do mesmo condomínio, inclusive por conversões distintas.
  perform id from public.condominios where id=p_condominio for update;
  perform c.id from public.cobrancas c where c.condominio_id=p_condominio and c.carteira_id=p_carteira order by c.id for update;
  select coalesce(array_agg(c.id),'{}'::uuid[]) into ids from public.cobrancas c
  where c.condominio_id=p_condominio and c.carteira_id=p_carteira and c.duplicada_de_id is null
    and c.created_at <= conv.criado_em
    and c.status_operacional in ('regular','novo','em_cobranca_ativa','possivel_acordo','em_negociacao')
    and coalesce(c.status_financeiro,'em_aberto') not in ('quitado','pago','cancelado','baixado','renegociado')
    -- A conversão mantém débitos com mais de cinco anos só no histórico.
    and c.vencimento >= ((now() at time zone 'America/Sao_Paulo')::date - interval '5 years')::date
    and (conv.preview_json->>'somenteAnoCorrente' is distinct from 'true'
      or extract(year from c.vencimento)=extract(year from now() at time zone 'America/Sao_Paulo'))
    and not exists(select 1 from jsonb_array_elements(p_importadas) i
      where i->>'unidade_id'=c.unidade_id::text and (
        (nullif(i->>'recibo','') is not null and public.cobranca_recibo_identidade('Recibo '||(i->>'recibo'))=public.cobranca_recibo_identidade(c.observacoes))
        or (i->>'vencimento'=c.vencimento::text and
          (nullif(i->>'recibo','') is null or public.cobranca_recibo_identidade(c.observacoes) is null))))
    and not exists(select 1 from public.acordos a where a.cobranca_id=c.id)
    and not exists(select 1 from public.acordo_cobrancas a where a.cobranca_id=c.id)
    and not exists(select 1 from public.cobrancas d where d.duplicada_de_id=c.id)
    and not exists(select 1 from public.fechamento_pagamentos f where f.cobranca_id=c.id);
  if cardinality(ids)=0 then
    resultado:=jsonb_build_object('removidas',0,'ids','[]'::jsonb,'mensagens_canceladas',0,'itens_removidos',0);
    update public.conversoes_relatorio set preview_json=jsonb_set(preview_json,'{limpezaAusentesPdf}',resultado) where id=p_conversao;
    return resultado;
  end if;

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
    motivo_cancelamento='Cobrança ausente no relatório importado: '||p_conversao::text
    where id=any(mensagens_ids) and status not in ('enviada','cancelada');
  get diagnostics canceladas = row_count;
  update public.mensagens m set payload=jsonb_set(coalesce(payload,'{}'::jsonb),'{cobranca_ids}',
    coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(m.payload->'cobranca_ids','[]'::jsonb)) v where not v::uuid=any(ids)),'[]'::jsonb))
    where id=any(mensagens_ids) and status<>'enviada' and payload ? 'cobranca_ids';
  update public.flow_progressao p set cobranca_ids=array(select v from unnest(p.cobranca_ids) v where not v=any(ids)),
    status=case when status in ('pendente','processando','atencao') then 'cancelado' else status end,
    token=null,lease_ate=null,erro='Débito ausente no relatório importado; continuação cancelada.',updated_at=now()
    where cobranca_ids && ids;
  update public.maestro_flow_montagens m set plano=(select jsonb_agg(coalesce((select jsonb_agg(v) from jsonb_array_elements_text(grupo) v where not v::uuid=any(ids)),'[]'::jsonb)) from jsonb_array_elements(m.plano) grupo),
    status=case when status='processando' then 'atencao' else status end,token=null,lease_ate=null,updated_at=now()
    where exists(select 1 from jsonb_array_elements(coalesce(m.plano,'[]'::jsonb)) grupo cross join lateral jsonb_array_elements_text(grupo) v where v::uuid=any(ids));
  select count(*) into itens from public.lote_itens where cobranca_id=any(ids);
  update public.central_pendencias set status='resolvida',resolvido_em=now(),payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object('resolucao','Cobrança removida por ausência no relatório','conversao_id',p_conversao,'pagamento_presumido',false)
    where (cobranca_id=any(ids) or (entidade_tipo='cobranca' and entidade_id=any(ids))) and status in ('aberta','em_tratamento');
  -- A FK de mensagens usa CASCADE: desvincular preserva o histórico integral.
  update public.mensagens m set cobranca_id=null,
    payload=coalesce(m.payload,'{}'::jsonb)||jsonb_build_object('cobranca_excluida_por_captacao',m.cobranca_id,'conversao_exclusao_id',p_conversao)
    where m.cobranca_id=any(ids);
  update public.interacoes set cobranca_id=null where cobranca_id=any(ids);
  update public.saneamento_cobrancas set cobranca_id=null where cobranca_id=any(ids);
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
    status=case when f.status='pausado' then f.status when not exists(select 1 from public.lote_itens where cobranca_flow_id=f.id) then 'cancelado' else f.status end,
    cancelado_em=case when f.status='pausado' then f.cancelado_em when not exists(select 1 from public.lote_itens where cobranca_flow_id=f.id) then now() else f.cancelado_em end
    where id=any(flows);
  insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,descricao,antes,depois)
    values(p_carteira,'conversao_relatorio',p_conversao,'conversao.ausentes_removidas','Cobranças ausentes removidas',
      'Captação PDF: remoção de ausentes sem acordo; histórico e acordos preservados, sem confirmação de pagamento.',
      jsonb_build_object('cobrancas',snapshot,'dependencias',dependencias),
      jsonb_build_object('ids',ids,'removidas',removidas,'mensagens_canceladas',canceladas,'itens_removidos',itens));
  resultado:=jsonb_build_object('removidas',removidas,'ids',ids,'mensagens_canceladas',canceladas,'itens_removidos',itens);
  update public.conversoes_relatorio set preview_json=jsonb_set(preview_json,'{limpezaAusentesPdf}',resultado) where id=p_conversao;
  return resultado;
end $$;
revoke all on function public.conversao_remover_cobrancas_ausentes(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.conversao_remover_cobrancas_ausentes(uuid,uuid,uuid,jsonb) to service_role;
commit;
