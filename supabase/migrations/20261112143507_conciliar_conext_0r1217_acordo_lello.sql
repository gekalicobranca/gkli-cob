-- Co.Next Liberdade 0R1217: concilia as cotas com o acordo Lello 1407267.
-- Consulta COJUR em 12/11/2026; a parcela de R$ 3.391,45 foi contabilizada
-- em 06/11/2026 e os quatro recibos constam como baixados por esse acordo.
-- A data formal do acordo não aparece no portal; 05/11 é a data observada da
-- baixa dos quatro recibos e fica identificada como aproximação.
do $conciliacao$
declare
  v_condominio uuid;
  v_unidade uuid;
  v_carteira uuid;
  v_antes jsonb;
  v_dados jsonb;
  v_resultado jsonb;
  v_acordo uuid;
  v_total integer;
  v_corretas integer;
  v_alteradas integer;
begin
  select id, carteira_id into strict v_condominio, v_carteira
  from public.condominios where nome = 'CO. NEXT LIBERDADE';
  select id into strict v_unidade from public.unidades
  where condominio_id = v_condominio and identificacao = '0R1217';

  select count(*), count(*) filter (
    where c.duplicada_de_id is null and c.status_financeiro = 'em_aberto'
      and ((c.vencimento = date '2026-07-10' and c.valor_original = 676.78
            and c.status = 'possivel_acordo' and c.arquivada_em is null
            and c.observacoes like '%Recibo: 52619180.%')
        or (c.vencimento = date '2026-08-07' and c.valor_original = 677.86
            and c.status = 'possivel_acordo' and c.arquivada_em is null
            and c.observacoes like '%Recibo: 52915701.%')
        or (c.vencimento = date '2026-09-07' and c.valor_original = 674.41
            and c.status = 'suspenso' and c.arquivada_em is not null
            and c.observacoes like '%Recibo: 53263120.%')
        or (c.vencimento = date '2026-10-07' and c.valor_original = 691.27
            and c.status = 'suspenso' and c.arquivada_em is not null
            and c.observacoes like '%Recibo: 53688284.%'))),
    jsonb_object_agg(c.id::text, to_jsonb(c))
    into v_total, v_corretas, v_antes
  from public.cobrancas c
  where c.unidade_id = v_unidade
    and c.vencimento in (date '2026-07-10', date '2026-08-07',
                         date '2026-09-07', date '2026-10-07');
  if v_total <> 4 or v_corretas <> 4 then
    raise exception 'As quatro cotas mudaram; conciliação cancelada';
  end if;
  if exists (select 1 from public.acordo_cobrancas ac
             join public.cobrancas c on c.id = ac.cobranca_id
             where c.unidade_id = v_unidade and c.vencimento in
               (date '2026-07-10', date '2026-08-07', date '2026-09-07', date '2026-10-07'))
     or exists (select 1 from public.acordos where unidade_id = v_unidade)
     or exists (select 1 from public.acordos_fontes_lello
                where codigo_condominio = '62905' and numero_acordo = '1407267') then
    raise exception 'Já existe vínculo de acordo; conciliação cancelada';
  end if;
  if not exists (select 1 from public.cobrancas where unidade_id = v_unidade
                 and vencimento = date '2026-11-07' and status = 'regular'
                 and arquivada_em is null) then
    raise exception 'Cota regular de novembro mudou; conciliação cancelada';
  end if;

  v_dados := jsonb_build_object(
    'codigo', '62905', 'numero', '1407267', 'unidade', '0R1217',
    'tipo_portal', 'Amigável', 'data_acordo', '2026-11-05',
    'data_acordo_criterio', 'data da baixa dos quatro recibos; data formal não exibida',
    'consultado_em', '2026-11-12T14:31:41.057Z',
    'total_centavos', 339145, 'pago_centavos', 339145, 'saldo_centavos', 0,
    'parcelas_pagas', 1, 'parcelas_abertas', 0,
    'parcelas', jsonb_build_array(jsonb_build_object(
      'vencimento', '2026-11-09', 'valor_centavos', 339145,
      'status', 'Contabilizado', 'data_pagamento', '2026-11-06')),
    'recibos', jsonb_build_array('52619180', '52915701', '53263120', '53688284'),
    'fonte', 'Portal Lello COJUR: histórico, acordo, composição de cotas e recibo da parcela',
    'sha256_historico', '554b4e8eec2772f63bfe1c4fa7c3c9595da6f3b523507c37eab6b550038c3db8',
    'sha256_acordo', 'd66e8d40c67108d9209eab2e0df6c502ddd9b257db15600a832401e4346939f3',
    'sha256_composicao', 'f1605f222bd2407bbb43ac6cc968d16d0d9e2bbbc3333f14386963fa8ef9c41f',
    'sha256_recebimento', 'e808e104e396d8eb8d95c789e048a44c1150860e0a83cd851382ea7c3d2694c3');

  select public.importar_acordo_lello(v_condominio, '62905', v_dados, true)
    into v_resultado;
  if v_resultado->>'acao' <> 'cadastrado' then
    raise exception 'Importador Lello não cadastrou o acordo: %', v_resultado;
  end if;
  v_acordo := (v_resultado->>'acordo_id')::uuid;

  update public.acordos set
    data_quitacao = date '2026-11-06',
    observacao_operacional = 'Lello COJUR: acordo 1407267 quitado, parcela única de R$ 3.391,45 contabilizada em 06/11/2026. Quatro recibos baixados pelo acordo em 05/11/2026. A data formal da celebração não é exibida; 05/11 foi usada como referência.',
    updated_at = now()
  where id = v_acordo;

  update public.parcelas_acordo set
    observacoes = coalesce(observacoes, '') || E'\nRecibo do histórico: 3313077; detalhe do pagamento: 3366482. Baixa automática Bradesco. Fonte Lello COJUR, consulta 12/11/2026.',
    updated_at = now()
  where acordo_id = v_acordo and numero = 1;

  -- O bloqueio do arquivo é suspenso somente nesta transação, sob lock
  -- exclusivo da tabela. As duas cotas retornam ao histórico operacional
  -- diretamente como quitadas; nenhuma é liberada para disparo.
  execute 'alter table public.cobrancas disable trigger zzz_proteger_arquivo_operacional_cobranca';
  update public.cobrancas set arquivada_em = null, arquivamento_motivo = null,
      status = 'acordo_firmado', status_operacional = 'acordo_efetivado',
      status_financeiro = 'quitado', automacao_bloqueada = true,
      observacao_financeira = 'Quitada pelo acordo Lello 1407267. Parcela única contabilizada em 06/11/2026; ver auditoria do arquivamento anterior.',
      updated_at = now()
  where unidade_id = v_unidade and vencimento in
    (date '2026-09-07', date '2026-10-07');
  get diagnostics v_alteradas = row_count;
  if v_alteradas <> 2 then raise exception 'Restauração incompleta'; end if;
  execute 'alter table public.cobrancas enable trigger zzz_proteger_arquivo_operacional_cobranca';

  insert into public.acordo_cobrancas
    (acordo_id, cobranca_id, valor_original_no_acordo)
  select v_acordo, c.id, c.valor_original from public.cobrancas c
  where c.unidade_id = v_unidade and c.vencimento in
    (date '2026-07-10', date '2026-08-07', date '2026-09-07', date '2026-10-07');
  get diagnostics v_alteradas = row_count;
  if v_alteradas <> 4 then raise exception 'Vínculos incompletos'; end if;

  update public.cobrancas set
    status = 'acordo_firmado', status_operacional = 'acordo_efetivado',
    status_financeiro = 'quitado', automacao_bloqueada = true,
    observacao_financeira = 'Quitada pelo acordo Lello 1407267. Recibo baixado pelo acordo em 05/11/2026; parcela única contabilizada em 06/11/2026.',
    updated_at = now()
  where unidade_id = v_unidade and vencimento in
    (date '2026-07-10', date '2026-08-07');
  get diagnostics v_alteradas = row_count;
  if v_alteradas <> 2 then raise exception 'Quitação incompleta'; end if;

  insert into public.auditoria_eventos
    (carteira_id, entidade_tipo, entidade_id, evento_tipo, titulo,
     descricao, usuario_nome, antes, depois, diferencas)
  select v_carteira, 'cobranca', c.id, 'cobranca.conciliada_lello',
    'Cota quitada pelo acordo Lello 1407267',
    'Recibo baixado por acordo no histórico Lello. Parcela única de R$ 3.391,45 contabilizada em 06/11/2026. Cota de novembro mantida regular.',
    'Codex (solicitação do usuário)', v_antes->c.id::text, to_jsonb(c),
    jsonb_build_object('acordo_externo', '1407267', 'recibo',
      case c.vencimento when date '2026-07-10' then '52619180'
                         when date '2026-08-07' then '52915701'
                         when date '2026-09-07' then '53263120'
                         when date '2026-10-07' then '53688284' end,
      'sha256_composicao', v_dados->>'sha256_composicao')
  from public.cobrancas c where c.unidade_id = v_unidade and c.vencimento in
    (date '2026-07-10', date '2026-08-07', date '2026-09-07', date '2026-10-07');

  insert into public.auditoria_eventos
    (carteira_id, entidade_tipo, entidade_id, evento_tipo, titulo,
     descricao, usuario_nome, depois, diferencas)
  values (v_carteira, 'acordo', v_acordo, 'acordo.importado_lello',
    'Acordo Lello 1407267 quitado',
    'Acordo amigável, quatro recibos, parcela única de R$ 3.391,45 contabilizada em 06/11/2026. Data de celebração não exibida; referência de 05/11 corresponde à baixa dos recibos.',
    'Codex (solicitação do usuário)',
    (select to_jsonb(a) from public.acordos a where a.id = v_acordo), v_dados);
end
$conciliacao$;
