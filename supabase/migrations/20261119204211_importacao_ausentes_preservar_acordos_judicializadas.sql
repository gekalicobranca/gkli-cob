begin;
create or replace function public.importacao_remover_cobrancas_ausentes(p_importacao uuid)
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
  resultado jsonb;
begin
  select * into strict imp from public.importacoes where id=p_importacao for update;
  if imp.tipo <> 'cobrancas' then raise exception 'Importação de cobranças obrigatória.'; end if;
  if imp.resumo ? 'limpeza_ausentes' then
    return imp.resumo->'limpeza_ausentes' || jsonb_build_object('ja_processada',true);
  end if;
  -- Uma importação finalizada não pode apagar dados novos com um relatório antigo.
  if imp.status not in ('preview','erro') or imp.carteira_id is null then
    return jsonb_build_object('removidas',0,'motivo','Importação finalizada ou sem carteira; nenhuma ausência removida.');
  end if;
  -- Uma planilha parcial ou com linhas inválidas não comprova ausência de débitos.
  if imp.total_invalidas > 0 or coalesce(imp.resumo->>'recorte_regua','') <> 'todos'
     or imp.resumo->>'parcial'='true' or imp.resumo->>'relatorioCompleto'='false'
     or coalesce((imp.resumo->'execucao_lotes'->>'cursor')::integer,-1) <> imp.total_validas
     or coalesce((imp.resumo->'execucao_lotes'->>'total')::integer,-1) <> imp.total_validas
     or coalesce((imp.resumo->'execucao_lotes'->'resultado'->>'divergentes')::integer,0) > 0
     or exists(select 1 from jsonb_array_elements_text(coalesce(imp.resumo->'execucao_lotes'->'resultado'->'erros','[]'::jsonb)) e
       where e !~ '^Linha [0-9]+: cobrança já existia e foi ignorada \([a-f0-9-]{36}\)\.$')
     or not exists(select 1 from public.importacao_itens where importacao_id=p_importacao and valido)
     or (select count(*) from public.importacao_itens where importacao_id=p_importacao) <> imp.total_linhas
     or (select count(*) from public.importacao_itens where importacao_id=p_importacao and valido) <> imp.total_validas then
    return jsonb_build_object('removidas',0,'ids','[]'::jsonb,'mensagens_canceladas',0,'itens_removidos',0,
      'motivo','Remoção de ausentes não executada: o relatório precisa estar completo, processado e sem falhas ou divergências.');
  end if;
  if exists(select 1 from public.importacao_itens i where i.importacao_id=p_importacao and (
    not i.valido or nullif(i.payload->>'vencimento','') is null
    or i.payload->>'carteira_id' is distinct from imp.carteira_id::text
    or not exists(select 1 from public.unidades u join public.condominios c on c.id=u.condominio_id
      where u.id::text=i.payload->>'unidade_id' and c.id::text=i.payload->>'condominio_id'
        and c.carteira_id=imp.carteira_id))) then
    raise exception 'Itens sem identificação segura ou fora do condomínio/carteira da importação.';
  end if;
  -- Serializa importações concorrentes do mesmo condomínio.
  perform c.id from public.condominios c where c.carteira_id=imp.carteira_id and exists(
    select 1 from public.importacao_itens i where i.importacao_id=p_importacao and i.payload->>'condominio_id'=c.id::text)
    order by c.id for update;
  -- FOR UPDATE impede novos vínculos por FK enquanto a remoção é validada.
  perform c.id from public.cobrancas c where exists(
    select 1 from public.importacao_itens i where i.importacao_id=p_importacao and i.valido
      and i.payload->>'condominio_id'=c.condominio_id::text and i.payload->>'carteira_id'=c.carteira_id::text)
    order by c.id for update;
  with importadas as (
    select i.payload,
      coalesce(public.cobranca_recibo_identidade('Recibo '||(i.payload->>'recibo')),
        public.cobranca_recibo_identidade(i.payload->>'referencia'),
        public.cobranca_recibo_identidade('Recibo '||(i.payload->>'referencia')),
        public.cobranca_recibo_identidade(i.payload->>'observacoes')) as recibo
    from public.importacao_itens i where i.importacao_id=p_importacao and i.valido
  )
  select coalesce(array_agg(c.id),'{}'::uuid[]) into ids from public.cobrancas c
  where c.duplicada_de_id is null and c.duplicada_origem_excluida_id is null and c.arquivada_em is null
    and c.carteira_id=imp.carteira_id and c.created_at <= imp.created_at
    and coalesce(c.status_operacional,'') not in ('judicializado','quitado','pago','cancelado','baixado')
    and coalesce(c.status,'') not in ('judicializado','quitado','pago','cancelado','baixado')
    and coalesce(c.status_financeiro,'em_aberto') not in ('quitado','pago','cancelado','baixado')
    and not exists(select 1 from public.unidades u where u.id=c.unidade_id and u.acao_judicial)
    and exists(select 1 from public.importacao_itens i where i.importacao_id=p_importacao and i.valido
      and i.payload->>'condominio_id'=c.condominio_id::text and i.payload->>'carteira_id'=c.carteira_id::text)
    and not exists(select 1 from importadas i where i.payload->>'unidade_id'=c.unidade_id::text
      and i.payload->>'condominio_id'=c.condominio_id::text and i.payload->>'carteira_id'=c.carteira_id::text
      and case when i.recibo is not null and public.cobranca_recibo_identidade(c.observacoes) is not null
        then i.recibo=public.cobranca_recibo_identidade(c.observacoes)
          or i.recibo=upper(substring(c.observacoes from $lello$(?i)^Recibo: [0-9]{6,}\r?\n(?:Conversão de relatório - recibo |Origem: Conversão de Relatório \| Sistema: Lello Condomínios \| Recibo: )(LELLO-[^[:space:]|]+)$lello$))
        else i.payload->>'vencimento'=c.vencimento::text end)
    and not exists(select 1 from public.acordos a where a.cobranca_id=c.id)
    and not exists(select 1 from public.acordo_cobrancas a where a.cobranca_id=c.id)
    and not exists(select 1 from public.cobrancas d where d.duplicada_de_id=c.id)
    and not exists(select 1 from public.fechamento_pagamentos f where f.cobranca_id=c.id);
  if cardinality(ids)=0 then
    resultado:=jsonb_build_object('removidas',0,'ids','[]'::jsonb,'mensagens_canceladas',0,'itens_removidos',0);
    update public.importacoes set resumo=jsonb_set(resumo,'{limpeza_ausentes}',resultado) where id=p_importacao;
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
    motivo_cancelamento='Cobrança ausente no relatório importado: '||p_importacao::text
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
  update public.central_pendencias set status='resolvida',resolvido_em=now(),payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object('resolucao','Cobrança removida por ausência no relatório','importacao_id',p_importacao,'pagamento_presumido',false)
    where (cobranca_id=any(ids) or (entidade_tipo='cobranca' and entidade_id=any(ids))) and status in ('aberta','em_tratamento');
  -- Preserva mensagens enviadas, recibos de entrega e histórico de interações.
  update public.mensagens m set cobranca_id=null,
    payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object('cobranca_excluida_por_importacao',m.cobranca_id,'importacao_exclusao_id',p_importacao)
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
    values(imp.carteira_id,'importacao',p_importacao,'importacao.ausentes_removidas','Cobranças ausentes removidas',
      'Remoção de cobranças abertas ausentes sem acordo e sem situação judicial; histórico preservado, sem presumir pagamento.',
      jsonb_build_object('cobrancas',snapshot,'dependencias',dependencias),
      jsonb_build_object('ids',ids,'removidas',removidas,'mensagens_canceladas',canceladas,'itens_removidos',itens));
  resultado:=jsonb_build_object('removidas',removidas,'ids',ids,'mensagens_canceladas',canceladas,'itens_removidos',itens);
  update public.importacoes set resumo=jsonb_set(resumo,'{limpeza_ausentes}',resultado) where id=p_importacao;
  return resultado;
end $$;
revoke all on function public.importacao_remover_cobrancas_ausentes(uuid) from public,anon,authenticated;
grant execute on function public.importacao_remover_cobrancas_ausentes(uuid) to service_role;

-- Os IDs da prévia podem ter ficado obsoletos após criar/recriar unidades.
-- Persiste apenas a resolução de unidades feita pelo servidor, na mesma transação.
create or replace function public.importacao_remover_cobrancas_ausentes(p_importacao uuid,p_unidades jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare imp public.importacoes;
begin
  select * into strict imp from public.importacoes where id=p_importacao for update;
  if imp.resumo ? 'limpeza_ausentes' then
    return imp.resumo->'limpeza_ausentes' || jsonb_build_object('ja_processada',true);
  end if;
  if imp.status not in ('preview','erro') then
    return jsonb_build_object('removidas',0,'motivo','Importação já finalizada; nenhuma ausência removida.');
  end if;
  if jsonb_typeof(p_unidades) is distinct from 'array' then raise exception 'Resolução de unidades obrigatória.'; end if;
  if jsonb_array_length(p_unidades) <> imp.total_validas
    or (select count(distinct u->>'linha') from jsonb_array_elements(p_unidades) u) <> imp.total_validas
    or exists(select 1 from jsonb_array_elements(p_unidades) u where not exists(
      select 1 from public.importacao_itens i join public.unidades un on un.id::text=u->>'unidade_id'
      where i.importacao_id=p_importacao and i.valido and i.linha::text=u->>'linha'
        and un.condominio_id::text=i.payload->>'condominio_id')) then
    return jsonb_build_object('removidas',0,'motivo','Unidades incompletas ou não resolvidas; nenhuma ausência removida.');
  end if;
  update public.importacao_itens i set payload=jsonb_set(i.payload,'{unidade_id}',u->'unidade_id')
    from jsonb_array_elements(p_unidades) u
    where i.importacao_id=p_importacao and i.valido and i.linha::text=u->>'linha';
  return public.importacao_remover_cobrancas_ausentes(p_importacao);
end $$;
revoke all on function public.importacao_remover_cobrancas_ausentes(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.importacao_remover_cobrancas_ausentes(uuid,jsonb) to service_role;
commit;
