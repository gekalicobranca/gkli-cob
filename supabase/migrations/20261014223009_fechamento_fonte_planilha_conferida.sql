-- Explicit source-backed reconciliation; contracts and actual receipt dates remain untouched.
alter table public.fechamento_periodos
  add column if not exists fonte_conferencia jsonb;

alter table public.fechamento_pagamentos
  alter column data_pagamento drop not null;

comment on column public.fechamento_periodos.fonte_conferencia is
  'Snapshot explícito da planilha conferida, com hash, linhas, decisões e vínculos. Quando informado, substitui a seleção por data na apuração deste período.';
comment on column public.fechamento_pagamentos.data_pagamento is
  'Data de recebimento conhecida. Pode ser nula em lançamentos incluídos por planilha conferida; nunca inferir pelo vencimento.';

CREATE OR REPLACE FUNCTION public.apurar_fechamento_mensal(p_periodo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_periodo public.fechamento_periodos%rowtype;
begin
  -- Preserve gestor authorization even when this RPC is called directly.
  if not (
    (session_user in ('postgres','supabase_admin')
      and coalesce(current_setting('role',true),'none') in ('none','postgres','supabase_admin'))
    or coalesce(current_setting('role',true),'')='service_role'
    or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','gestor'))
  ) then
    raise exception 'Somente gestores podem apurar o fechamento.' using errcode='42501';
  end if;
  select * into v_periodo
    from public.fechamento_periodos
   where id = p_periodo_id
   for update;

  if not found then
    raise exception 'Periodo de fechamento nao encontrado.';
  end if;

  if v_periodo.status in ('fechado', 'faturado', 'cancelado') then
    raise exception 'Periodo % nao permite nova apuracao.', v_periodo.status;
  end if;

  delete from public.fechamento_pagamentos where periodo_id = p_periodo_id;
  delete from public.fechamento_despesas where periodo_id = p_periodo_id;
  delete from public.fechamento_comissoes where periodo_id = p_periodo_id;
  delete from public.fechamento_faturamentos_omie where periodo_id = p_periodo_id;
  delete from public.fechamento_operadores where periodo_id = p_periodo_id;
  delete from public.fechamento_carteiras where periodo_id = p_periodo_id;

  -- A planilha conferida define a composição deste fechamento, sem inferir recebimentos.
  if v_periodo.fonte_conferencia is not null then
    if coalesce(v_periodo.fonte_conferencia->>'versao','') <> '1'
       or jsonb_typeof(v_periodo.fonte_conferencia->'itens') is distinct from 'array'
       or jsonb_array_length(v_periodo.fonte_conferencia->'itens') = 0 then
      raise exception 'Fonte de conferência inválida.';
    end if;
    if exists (
      select 1 from jsonb_to_recordset(v_periodo.fonte_conferencia->'itens')
        as x(chave text, valor numeric, repasse numeric)
      where x.chave is null or x.valor is null or x.valor < 0
         or x.repasse is null or x.repasse < 0
    ) or (
      select count(*) <> count(distinct x.chave)
      from jsonb_to_recordset(v_periodo.fonte_conferencia->'itens') as x(chave text)
    ) then
      raise exception 'Linhas de conferência ausentes, duplicadas ou com valores inválidos.';
    end if;
    insert into public.fechamento_pagamentos (
      periodo_id, acordo_id, parcela_id, cobranca_id, condominio_id, unidade_id,
      carteira_id, operador_id, data_pagamento, valor_pago, valor_base_cobranca,
      percentual_despesa_cobranca, valor_despesa_cobranca, percentual_comissao,
      valor_comissao, origem, divergencia, observacoes, tipo_pagamento,
      valor_recuperado, valor_entrada, quantidade_parcelas
    )
    select p_periodo_id, x.acordo_id, x.parcela_id, a.cobranca_id,
      x.condominio_id, x.unidade_id, x.carteira_id, x.operador_id,
      x.data_pagamento, round(x.valor,2), round(x.valor,2),
      case when x.valor > 0 then round(x.repasse/x.valor*100,4) else 0 end,
      round(x.repasse,2), coalesce(a.comissao_percentual,0),
      round(x.valor*coalesce(a.comissao_percentual,0)/100,2),
      'planilha_conferida', coalesce(x.divergencia,false),
      concat('Fonte conferida: ',v_periodo.fonte_conferencia->>'arquivo',' / ',x.chave,
        '. Vencimento original: ',x.vencimento_original,
        '. Parcela na fonte: ',x.parcela_fonte,
        '. Condomínio/unidade/bloco na fonte: ',x.condominio_fonte,' / ',x.unidade_fonte,' / ',x.bloco_fonte,
        '. Incluída no faturamento de set/out de 2026, competência ',v_periodo.competencia,
        '. ',case when x.data_pagamento is null then 'Data de pagamento não informada; inclusão baseada na planilha, sem baixa no contrato. ' else 'Data de pagamento existente preservada. ' end,
        coalesce(x.observacoes,'')),
      x.tipo_pagamento, round(x.valor,2), 0, coalesce(x.quantidade_parcelas,1)
    from jsonb_to_recordset(v_periodo.fonte_conferencia->'itens') as x(
      chave text, acordo_id uuid, parcela_id uuid, condominio_id uuid,
      unidade_id uuid, carteira_id uuid, operador_id uuid, data_pagamento date,
      valor numeric, repasse numeric, divergencia boolean, observacoes text,
      tipo_pagamento text, quantidade_parcelas integer, vencimento_original date,
      parcela_fonte text, condominio_fonte text, unidade_fonte text, bloco_fonte text
    )
    left join public.acordos a on a.id=x.acordo_id;
  else
  insert into public.fechamento_pagamentos (
    periodo_id,
    acordo_id,
    parcela_id,
    cobranca_id,
    condominio_id,
    unidade_id,
    carteira_id,
    operador_id,
    data_pagamento,
    valor_pago,
    valor_base_cobranca,
    percentual_despesa_cobranca,
    valor_despesa_cobranca,
    percentual_comissao,
    valor_comissao,
    origem,
    divergencia,
    observacoes,
    tipo_pagamento,
    valor_recuperado,
    valor_entrada,
    quantidade_parcelas
  )
  with pagamentos_recebidos as (
    select
      a.*,
      p.id as parcela_paga_id, p.valor_repasse_informado,
      p.numero as numero_parcela_paga,
      p.data_pagamento::date as data_recebimento,
      coalesce(p.valor, 0) as valor_recebido,
      coalesce(p.tipo_parcela, '') as tipo_parcela_paga,
      coalesce(nullif(a.quantidade_parcelas, 0), (select count(*) from public.parcelas_acordo px where px.acordo_id = a.id), 0) as total_parcelas,
      coalesce((
        select sum(coalesce(ac.valor_atualizado_no_acordo, 0))
        from public.acordo_cobrancas ac
        where ac.acordo_id = a.id
      ), coalesce(a.valor_acordado, 0)) as valor_base_total
    from public.parcelas_acordo p
    join public.acordos a on a.id = p.acordo_id
    where p.data_pagamento is not null
      and coalesce(p.status, '') in ('paga', 'pago', 'quitada', 'quitado', 'efetivado', 'efetivada')
      and p.data_pagamento::date between v_periodo.data_abertura and v_periodo.data_fechamento
  )
  select
    p_periodo_id,
    a.id,
    a.parcela_paga_id,
    a.cobranca_id,
    a.condominio_id,
    a.unidade_id,
    a.carteira_id,
    coalesce(a.operador_id, a.created_by),
    a.data_recebimento,
    a.valor_recebido,
    a.valor_recebido,
    coalesce(a.despesa_cobranca_percentual, 0),
    coalesce(a.valor_repasse_informado, case
      when coalesce(a.despesa_cobranca_valor, 0) > 0 and coalesce(a.valor_acordado, 0) > 0
        then round(a.despesa_cobranca_valor * a.valor_recebido / a.valor_acordado, 2)
      else round(a.valor_recebido * coalesce(a.despesa_cobranca_percentual, 0) / 100, 2)
    end),
    coalesce(a.comissao_percentual, 0),
    round(a.valor_recebido * coalesce(a.comissao_percentual, 0) / 100, 2),
    'pagamento_recebido',
    false,
    'Parcela recebida dentro do periodo de competencia.',
    case
      when coalesce(a.entrada, 0) >= coalesce(a.valor_acordado, 0) or coalesce(a.total_parcelas, 0) <= 1 then 'a_vista'
      else 'parcelado'
    end,
    a.valor_recebido,
    case when a.numero_parcela_paga = 0 or a.tipo_parcela_paga = 'entrada' then a.valor_recebido else 0 end,
    coalesce(a.total_parcelas, 0)
  from pagamentos_recebidos a;
  end if;

  insert into public.fechamento_despesas (
    periodo_id,
    carteira_id,
    condominio_id,
    valor_base,
    percentual_despesa,
    valor_despesa,
    origem
  )
  select
    periodo_id,
    carteira_id,
    condominio_id,
    sum(valor_recuperado),
    case when sum(valor_recuperado) > 0 then round(sum(valor_despesa_cobranca) / sum(valor_recuperado) * 100, 4) else 0 end,
    sum(valor_despesa_cobranca),
    'pagamentos_recebidos'
  from public.fechamento_pagamentos
  where periodo_id = p_periodo_id
  group by periodo_id, carteira_id, condominio_id;

  insert into public.fechamento_operadores (
    periodo_id,
    carteira_id,
    operador_id,
    acordos_realizados,
    acordos_a_vista,
    acordos_parcelados,
    valor_base_cobranca,
    valor_recuperado,
    valor_pago_entrada,
    valor_despesa_a_vista,
    valor_despesa_parcelado,
    valor_despesa_total
  )
  select
    periodo_id,
    carteira_id,
    operador_id,
    count(*),
    count(*) filter (where tipo_pagamento = 'a_vista'),
    count(*) filter (where tipo_pagamento = 'parcelado'),
    sum(valor_base_cobranca),
    sum(valor_recuperado),
    sum(valor_pago),
    sum(case when tipo_pagamento = 'a_vista' then valor_despesa_cobranca else 0 end),
    sum(case when tipo_pagamento = 'parcelado' then valor_despesa_cobranca else 0 end),
    sum(valor_despesa_cobranca)
  from public.fechamento_pagamentos
  where periodo_id = p_periodo_id
  group by periodo_id, carteira_id, operador_id;

  insert into public.fechamento_carteiras (
    periodo_id,
    carteira_id,
    acordos_realizados,
    valor_base_cobranca,
    valor_recuperado,
    percentual_comissao,
    valor_comissao
  )
  select
    periodo_id,
    carteira_id,
    count(*),
    sum(valor_base_cobranca),
    sum(valor_recuperado),
    case when sum(valor_recuperado) > 0 then round(sum(valor_comissao) / sum(valor_recuperado) * 100, 4) else 0 end,
    sum(valor_comissao)
  from public.fechamento_pagamentos
  where periodo_id = p_periodo_id
  group by periodo_id, carteira_id;

  insert into public.fechamento_comissoes (
    periodo_id,
    carteira_id,
    operador_id,
    valor_base,
    percentual_comissao,
    valor_comissao,
    origem
  )
  select
    periodo_id,
    carteira_id,
    operador_id,
    sum(valor_recuperado),
    case when sum(valor_recuperado) > 0 then round(sum(valor_comissao) / sum(valor_recuperado) * 100, 4) else 0 end,
    sum(valor_comissao),
    'pagamentos_recebidos'
  from public.fechamento_pagamentos
  where periodo_id = p_periodo_id
  group by periodo_id, carteira_id, operador_id;

  insert into public.fechamento_faturamentos_omie (
    periodo_id,
    carteira_id,
    condominio_id,
    tipo_faturamento,
    valor_base,
    valor_faturamento,
    status,
    observacoes,
    competencia,
    emissor_cnpj,
    emissor_razao_social,
    emissor_inscricao_municipal,
    emissor_municipio,
    emissor_uf,
    tomador_cnpj,
    tomador_razao_social,
    nfse_codigo_servico,
    nfse_codigo_lc116,
    nfse_discriminacao,
    nfse_status,
    nfse_pendencias,
    nfse_rps_serie,
    demonstrativo_itens
  )
  select
    d.periodo_id,
    d.carteira_id,
    d.condominio_id,
    'repasse_cobranca_extrajudicial',
    d.valor_base,
    d.valor_despesa,
    'pendente',
    case
      when array_length(pendencias.itens, 1) is null then 'Base fiscal pronta para emissao de NFS-e.'
      else 'Base fiscal com pendencias cadastrais para emissao de NFS-e.'
    end,
    v_periodo.competencia,
    fiscal.emissor_cnpj,
    fiscal.emissor_razao_social,
    nullif(trim(coalesce(carteira.nfse_emissor_inscricao_municipal, '')), ''),
    coalesce(nullif(trim(carteira.nfse_emissor_municipio), ''), 'Sao Paulo'),
    coalesce(nullif(trim(carteira.nfse_emissor_uf), ''), 'SP'),
    fiscal.tomador_cnpj,
    fiscal.tomador_razao_social,
    coalesce(nullif(trim(carteira.nfse_codigo_servico), ''), '03220'),
    coalesce(nullif(trim(carteira.nfse_codigo_lc116), ''), '17.14'),
    concat(
      'Repasse de cobranca extrajudicial - ',
      fiscal.tomador_razao_social,
      E'\n\nComposicao do repasse do mes:\n',
      coalesce(itens.texto, ''),
      E'\nTotal do repasse do mes: R$',
      replace(to_char(d.valor_despesa, 'FM999999999990.00'), '.', ','),
      ' - Qtde ',
      coalesce(jsonb_array_length(itens.json), 0),
      ' x Valor Unit. R$ ',
      replace(to_char(d.valor_despesa, 'FM999999999990.00'), '.', ','),
      ' = Total R$ ',
      replace(to_char(d.valor_despesa, 'FM999999999990.00'), '.', ','),
      '.'
    ),
    case when array_length(pendencias.itens, 1) is null then 'pronto_emissao' else 'pendente_dados' end,
    coalesce(pendencias.itens, '{}'::text[]),
    coalesce(nullif(trim(carteira.nfse_serie_rps), ''), 'NFSE'),
    coalesce(itens.json, '[]'::jsonb)
  from public.fechamento_despesas d
  left join public.carteiras carteira on carteira.id = d.carteira_id
  left join public.condominios condominio on condominio.id = d.condominio_id
  left join lateral (
    select
      nullif(regexp_replace(coalesce(carteira.nfse_emissor_cnpj, ''), '[^0-9]', '', 'g'), '') as emissor_cnpj,
      coalesce(nullif(trim(carteira.nfse_emissor_razao_social), ''), nullif(trim(carteira.nome), ''), 'Emissor nao informado') as emissor_razao_social,
      nullif(regexp_replace(coalesce(condominio.cnpj, ''), '[^0-9]', '', 'g'), '') as tomador_cnpj,
      coalesce(nullif(trim(condominio.nome_operacional), ''), nullif(trim(condominio.nome), ''), 'Tomador nao informado') as tomador_razao_social
  ) fiscal on true
  left join lateral (
    select array_remove(array[
      case when length(coalesce(fiscal.emissor_cnpj, '')) <> 14 then 'CNPJ emissor da carteira' end,
      case when fiscal.emissor_razao_social = 'Emissor nao informado' then 'Razao social emissora da carteira' end,
      case when length(coalesce(fiscal.tomador_cnpj, '')) <> 14 then 'CNPJ tomador do condominio' end,
      case when fiscal.tomador_razao_social = 'Tomador nao informado' then 'Razao social do tomador' end
    ], null)::text[] as itens
  ) pendencias on true
  left join lateral (
    select
      string_agg(
        concat(
          '- Unid. ', coalesce(nullif(trim(unidade.identificacao), ''), '-'),
          case when nullif(trim(coalesce(unidade.bloco, '')), '') is not null then E'\nBloco ' || unidade.bloco else '' end,
          E'\nParcela ',
          coalesce(parcela.numero::text, '-'),
          case when coalesce(fp.quantidade_parcelas, 0) > 0 then '/' || fp.quantidade_parcelas::text else '' end,
          E'\nPeriodo ',
          coalesce(nullif(trim(cobranca.competencia), ''), to_char(cobranca.vencimento, 'MM/YYYY'), '-'),
          E'\nRepasse R$',
          replace(to_char(fp.valor_despesa_cobranca, 'FM999999999990.00'), '.', ',')
        ),
        E'\n'
        order by unidade.bloco nulls last, unidade.identificacao nulls last, fp.data_pagamento
      ) as texto,
      jsonb_agg(
        jsonb_build_object(
          'fechamento_pagamento_id', fp.id,
          'acordo_id', fp.acordo_id,
          'unidade', unidade.identificacao,
          'bloco', unidade.bloco,
          'parcela', parcela.numero,
          'total_parcelas', fp.quantidade_parcelas,
          'periodo', coalesce(nullif(trim(cobranca.competencia), ''), to_char(cobranca.vencimento, 'MM/YYYY')),
          'valor_repasse', fp.valor_despesa_cobranca,
          'valor_recuperado', fp.valor_recuperado
        )
        order by unidade.bloco nulls last, unidade.identificacao nulls last, fp.data_pagamento
      ) as json
    from public.fechamento_pagamentos fp
    left join public.unidades unidade on unidade.id = fp.unidade_id
    left join public.parcelas_acordo parcela on parcela.id = fp.parcela_id
    left join public.cobrancas cobranca on cobranca.id = fp.cobranca_id
    where fp.periodo_id = d.periodo_id
      and fp.carteira_id is not distinct from d.carteira_id
      and fp.condominio_id is not distinct from d.condominio_id
  ) itens on true
  where d.periodo_id = p_periodo_id
    and d.valor_despesa > 0;

  update public.fechamento_periodos fp
     set total_pagamentos_confirmados = coalesce((select sum(valor_pago) from public.fechamento_pagamentos where periodo_id = p_periodo_id), 0),
         total_base_cobranca = coalesce((select sum(valor_base_cobranca) from public.fechamento_pagamentos where periodo_id = p_periodo_id), 0),
         total_despesas_cobranca = coalesce((select sum(valor_despesa) from public.fechamento_despesas where periodo_id = p_periodo_id), 0),
         total_comissoes = coalesce((select sum(valor_comissao) from public.fechamento_carteiras where periodo_id = p_periodo_id), 0),
         total_faturamento_omie = coalesce((select sum(valor_faturamento) from public.fechamento_faturamentos_omie where periodo_id = p_periodo_id), 0),
         updated_at = now()
   where fp.id = p_periodo_id;

  insert into public.fechamento_auditoria (periodo_id, user_id, acao, descricao, dados)
  values (
    p_periodo_id,
    auth.uid(),
    'apuracao_rpc',
    'Apuracao recalculada com todos os pagamentos recebidos na competencia.',
    jsonb_build_object('data_abertura', v_periodo.data_abertura, 'data_fechamento', v_periodo.data_fechamento)
  );
end;
$function$

