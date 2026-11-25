-- Permite localizar mensagens agrupadas sem percorrer a tabela a cada escopo.
create index if not exists idx_mensagens_payload_cobranca_ids
  on public.mensagens using gin ((payload->'cobranca_ids'));

CREATE OR REPLACE FUNCTION public.maestro_substituir_captacao(p_conversao uuid, p_inicio timestamp with time zone, p_ids uuid[], p_importadas jsonb, p_valores jsonb, p_novas jsonb, p_parcelas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  imp public.conversoes_relatorio;
  ids uuid[]; flows uuid[]; mensagens_ids uuid[];
  removidas integer; canceladas integer; preservadas integer; sem_recibo integer;

  resultado jsonb;
  unidades_escopo uuid[];
  cotas_escopo uuid[];
  mensagens_escopo uuid[];
  unidades_retidas uuid[];
  linhas_retidas integer := 0;

begin
  select * into strict imp from public.conversoes_relatorio where id=p_conversao for update;
  if imp.origem not like 'captacao_automatizada:%'
    or imp.preview_json->>'captacaoAutomatizada' is distinct from 'true'
    or imp.status is distinct from 'processando' or imp.atualizado_em is distinct from p_inicio
    or imp.preview_json ? 'conciliacaoMaestro' then
    raise exception 'Conversão não pertence ao processamento atual do Maestro.';
  end if;
  if imp.preview_json->>'relatorioCompleto'='false' or imp.preview_json->>'parcial'='true'
    or coalesce(imp.preview_json->>'recorteRegua','todos')<>'todos'
    or jsonb_typeof(p_importadas) is distinct from 'array'
    or jsonb_array_length(p_importadas) is distinct from imp.total_cobrancas
    or (jsonb_array_length(p_importadas)=0 and imp.preview_json->>'semPendencias' is distinct from 'true')
    or (imp.preview_json ? 'escopoBlocosMaestro' and jsonb_typeof(imp.preview_json->'escopoBlocosMaestro') is distinct from 'array')
    or (imp.condominio_id='cb988811-e0ea-45d6-990b-6476271eb109'::uuid and not (imp.preview_json ? 'escopoBlocosMaestro')) then
    raise exception 'Relatório ou escopo incompleto para substituir cobranças.';
  end if;

  perform id from public.condominios where id=imp.condominio_id and carteira_id=imp.carteira_id for update;
  if not found then raise exception 'Condomínio fora da carteira da conversão.'; end if;
  perform c.id from public.cobrancas c
    where c.condominio_id=imp.condominio_id and c.carteira_id=imp.carteira_id order by c.id for update;
  ids := public.maestro_cobrancas_substituiveis(p_conversao);
  if ids is distinct from p_ids then raise exception 'As cobranças mudaram durante a captação. Reprocesse o relatório.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_importadas) i(unidade_id uuid,vencimento date)
    where i.vencimento is null or not exists(select 1 from public.unidades u
      where u.id=i.unidade_id and u.condominio_id=imp.condominio_id)) then
    raise exception 'Há lançamentos sem vencimento ou unidade do condomínio.';
  end if;


  select array(select distinct unidade_id from (
    select unidade_id from public.cobrancas where id=any(ids)
    union select unidade_id from jsonb_to_recordset(p_importadas) i(unidade_id uuid)
  ) s) into unidades_escopo;
  select array(select c.id from public.cobrancas c where c.condominio_id=imp.condominio_id
    and c.carteira_id=imp.carteira_id and c.unidade_id=any(unidades_escopo)) into cotas_escopo;

  -- O transporte também reserva a mensagem sob lock. Ler o estado depois de obter
  -- os locks impede que uma reserva recente seja confundida com um cancelamento.
  select array(select m.id from public.mensagens m where
    m.cobranca_id=any(cotas_escopo) or (m.payload->'cobranca_ids') ?| cotas_escopo::text[]
    or (m.carteira_id=imp.carteira_id and m.unidade_id=any(unidades_escopo))
    order by m.id for update) into mensagens_escopo;

  with pendentes as materialized (
    select m.* from public.mensagens m where m.id=any(mensagens_escopo) and (
      m.status in ('em_envio','enviando','incerto') or m.status_operacional in ('em_envio','enviando','incerto')
      or exists(select 1 from public.email_tentativas t where t.mensagem_id=m.id and t.estado in ('em_envio','incerto'))
      or exists(select 1 from public.thunderbird_envios t where t.mensagem_id=m.id and t.estado in ('reservado','enviando','incerto'))
      or exists(select 1 from public.whatsapp_web_envios w where w.mensagem_id=m.id and w.estado in ('reservado','incerto'))
    )
  ), afetadas as (
    select c.unidade_id from public.cobrancas c join pendentes m
      on c.id=m.cobranca_id or (m.payload->'cobranca_ids') ? c.id::text
      where c.id=any(cotas_escopo)
    union select m.unidade_id from pendentes m where m.carteira_id=imp.carteira_id and m.unidade_id=any(unidades_escopo)
  ) select array(select unidade_id from afetadas order by unidade_id) into unidades_retidas;

  if cardinality(unidades_retidas)>0 then
    select count(*) into linhas_retidas from jsonb_to_recordset(p_importadas) i(unidade_id uuid)
      where i.unidade_id=any(unidades_retidas);
    select array(select c.id from public.cobrancas c where c.id=any(ids)
      and not(c.unidade_id=any(unidades_retidas)) order by c.id) into ids;
    select coalesce(jsonb_agg(v),'[]') into p_valores from jsonb_array_elements(p_valores) v
      where not exists(select 1 from public.cobrancas c where c.id=(v->>'id')::uuid and c.unidade_id=any(unidades_retidas));
    -- Manter as parcelas das demais cotas e as validações de integridade de seus IDs.
    select coalesce(jsonb_agg(p),'[]') into p_parcelas from jsonb_array_elements(p_parcelas) p
      where not exists(select 1 from jsonb_to_recordset(p_novas) n(id uuid,unidade_id uuid)
        where n.id=(p->>'cobranca_id')::uuid and n.unidade_id=any(unidades_retidas));
    select coalesce(jsonb_agg(n),'[]') into p_novas from jsonb_array_elements(p_novas) n
      where not ((n->>'unidade_id')::uuid=any(unidades_retidas));
  end if;
  with recibos as materialized (
    select distinct i.unidade_id,public.cobranca_recibo_identidade('Recibo '||i.recibo) recibo
    from jsonb_to_recordset(p_importadas) i(unidade_id uuid,recibo text)
  )
  select count(*),count(*) filter (where r.recibo is null)
  into preservadas,sem_recibo
  from public.cobrancas c join public.unidades u on u.id=c.unidade_id
  left join recibos r
    on r.unidade_id=c.unidade_id
    and r.recibo=public.cobranca_recibo_identidade(c.observacoes)
  where c.condominio_id=imp.condominio_id and c.carteira_id=imp.carteira_id
    and c.conversao_relatorio_id is distinct from imp.id and c.arquivada_em is null
    and c.duplicada_de_id is null and not(c.id=any(ids))
    and (not (imp.preview_json ? 'escopoBlocosMaestro') or upper(trim(u.bloco)) in (
      select upper(trim(value)) from jsonb_array_elements_text(imp.preview_json->'escopoBlocosMaestro')
    ))
    and (nullif(imp.preview_json->>'blocoPadraoCaptacao','') is null
      or upper(trim(u.bloco))=upper(trim(imp.preview_json->>'blocoPadraoCaptacao')));

  -- A conciliação existente atualiza apenas os valores selecionados, sem tratar ausências.
  resultado := public.maestro_conciliar_cobrancas(p_conversao,p_inicio,p_importadas,p_valores,false);
  if coalesce(resultado->>'motivo','') <> 'Ausências não arquivadas: captação parcial ou com linhas a conferir.' then
    raise exception 'As cobranças preservadas mudaram durante a captação: %', resultado->>'motivo';
  end if;

  select coalesce(array_agg(m.id),'{}'::uuid[]) into mensagens_ids from public.mensagens m
    where m.cobranca_id=any(ids) or (m.payload->'cobranca_ids') ?| (ids::text[]);
  perform m.id from public.mensagens m where m.id=any(mensagens_ids) order by m.id for update;
  if exists(select 1 from public.mensagens m where m.id=any(mensagens_ids) and (m.status in ('em_envio','incerto','enviando') or m.status_operacional in ('em_envio','incerto','enviando')))
    or exists(select 1 from public.email_tentativas t where t.mensagem_id=any(mensagens_ids) and t.estado in ('em_envio','incerto'))
    or exists(select 1 from public.whatsapp_web_envios t where t.mensagem_id=any(mensagens_ids) and t.estado in ('reservado','incerto'))
    or exists(select 1 from public.thunderbird_envios t where t.mensagem_id=any(mensagens_ids) and t.estado in ('reservado','enviando','incerto')) then
    raise exception 'Há mensagens em envio. Reprocesse a captação após a conclusão.';
  end if;
  select coalesce(array_agg(distinct f),'{}'::uuid[]) into flows from (
    select cobranca_flow_id f from public.mensagens where id=any(mensagens_ids)
    union select cobranca_flow_id from public.lote_itens where cobranca_id=any(ids)
  ) q where f is not null;
  update public.mensagens set status='cancelada',status_operacional='cancelada',cancelado_em=now(),
    cancelada_em=now(),agendada_para=null,scheduled_at=null,motivo_cancelamento='Cobrança substituída na captação'
    where id=any(mensagens_ids) and status in ('rascunho','pendente_aprovacao','aprovada','agendada','falha');
  get diagnostics canceladas=row_count;
  delete from public.email_agenda a using public.mensagens m
    where a.mensagem_id=m.id and m.id=any(mensagens_ids) and m.status='cancelada';
  update public.flow_progressao set status='cancelado',token=null,lease_ate=null,
    erro='Cobrança substituída na captação.',updated_at=now()
    where cobranca_ids && ids and status in ('pendente','processando','atencao');
  update public.maestro_flow_montagens m set status='atencao', token=null,lease_ate=null,
    erro='Cobranças substituídas em captação posterior.',updated_at=now()
    where m.status in ('pendente','processando') and m.conversao_id<>p_conversao
      and m.condominio_id=imp.condominio_id and m.carteira_id=imp.carteira_id
      and (exists(select 1 from public.cobrancas c where c.id=any(ids) and c.conversao_relatorio_id=m.conversao_id)
        or exists(select 1 from jsonb_array_elements(coalesce(m.plano,'[]'::jsonb)) as etapa(cobrancas) where etapa.cobrancas ?| (ids::text[])));
  update public.central_pendencias set status='resolvida',resolvido_em=now()
    where (cobranca_id=any(ids) or (entidade_tipo='cobranca' and entidade_id=any(ids)))
      and status in ('aberta','em_tratamento');

  perform public.maestro_arquivar_copias_de_ausentes(p_conversao,ids);
  delete from public.cobrancas where id=any(ids);
  get diagnostics removidas=row_count;
  update public.cobranca_flows f set
    total_pendentes=(select count(*) from public.mensagens m where m.cobranca_flow_id=f.id and m.status in ('pendente_aprovacao','aprovada')),
    total_agendadas=(select count(*) from public.mensagens m where m.cobranca_flow_id=f.id and m.status='agendada'),
    total_falhas=(select count(*) from public.mensagens m where m.cobranca_flow_id=f.id and m.status='falha'),
    proximo_disparo_em=(select min(m.agendada_para) from public.mensagens m where m.cobranca_flow_id=f.id and m.status='agendada'),
    status=case when f.status in ('pronto','em_execucao','pausado') and not exists(
      select 1 from public.mensagens m where m.cobranca_flow_id=f.id and m.status in ('pendente_aprovacao','aprovada','agendada','falha')
    ) then 'cancelado' else f.status end
    where f.id=any(flows);

  insert into public.cobrancas(id,carteira_id,condominio_id,unidade_id,competencia,valor_original,valor_atualizado,
    multa,correcao,juros,vencimento,status,status_operacional,status_financeiro,automacao_bloqueada,observacoes,origem_importacao,conversao_relatorio_id)
  select n.id,imp.carteira_id,imp.condominio_id,n.unidade_id,n.competencia,n.valor_original,n.valor_atualizado,
    n.multa,n.correcao,n.juros,n.vencimento,n.status,n.status_operacional,n.status_financeiro,n.automacao_bloqueada,n.observacoes,n.origem_importacao,p_conversao
  from jsonb_populate_recordset(null::public.cobrancas,p_novas) n;
  insert into public.cobranca_parcelas(cobranca_id,conversao_relatorio_id,data_vencimento,referencia,valor_original,valor_atualizado,status,origem_linha_json)
  select p.cobranca_id,p_conversao,p.data_vencimento,p.referencia,p.valor_original,p.valor_atualizado,p.status,p.origem_linha_json
  from jsonb_populate_recordset(null::public.cobranca_parcelas,p_parcelas) p;

  resultado := (resultado-'motivo')||jsonb_build_object('removidas',removidas,'mensagensCanceladas',canceladas,
    'preservadas',preservadas,'semReciboCorrespondente',sem_recibo,'unidadesComEnvioPendente',unidades_retidas,'linhasComEnvioPendente',linhas_retidas,
    'criadas',jsonb_array_length(p_novas),'parcelasCriadas',jsonb_array_length(p_parcelas));
  update public.conversoes_relatorio set limpeza_maestro_em=now(),preview_json=jsonb_set(preview_json,'{conciliacaoMaestro}',resultado)
    where id=p_conversao;
  return resultado;
end $function$
;
