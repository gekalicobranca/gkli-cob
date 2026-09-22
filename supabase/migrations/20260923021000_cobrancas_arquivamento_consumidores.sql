begin;

set local lock_timeout='5s';

-- Mantém colunas, permissões e opções das views; filtra a origem antes das agregações.

create or replace view public.v_cobrancas_bloqueio_planilha_adm as
 SELECT id AS cobranca_id,
    carteira_id,
    condominio_id,
    unidade_id,
    created_at AS captada_em,
    planilha_debitos_competencia,
    to_char(now(), 'YYYY-MM'::text) AS competencia_atual,
    (((created_at)::date < (date_trunc('month'::text, now()))::date) AND (COALESCE(planilha_debitos_competencia, ''::text) <> to_char(now(), 'YYYY-MM'::text))) AS bloqueada_para_formalizacao
   FROM (SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) c;

create or replace view public.vw_analytics_executivo_p45 as
 WITH cobrancas_base AS (
         SELECT c.carteira_id,
            count(*) AS cobrancas,
            count(*) FILTER (WHERE (c.status_financeiro = 'em_aberto'::text)) AS abertas,
            count(*) FILTER (WHERE (c.status_operacional = 'em_negociacao'::text)) AS negociacao,
            count(*) FILTER (WHERE (c.status_operacional = ANY (ARRAY['acordo_firmado'::text, 'acordo_efetivado'::text]))) AS em_acordo,
            count(*) FILTER (WHERE (c.status_operacional = 'acordo_efetivado'::text)) AS efetivadas,
            sum(COALESCE(c.valor_atualizado, c.valor_original, (0)::numeric)) AS valor_total,
            sum(COALESCE(c.valor_atualizado, c.valor_original, (0)::numeric)) FILTER (WHERE (c.status_financeiro = 'em_aberto'::text)) AS valor_aberto,
            avg(GREATEST(0, (CURRENT_DATE - c.vencimento))) AS atraso_medio
           FROM (SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) c
          GROUP BY c.carteira_id
        ), acordos_base AS (
         SELECT a.carteira_id,
            count(*) AS acordos,
            count(*) FILTER (WHERE (a.status = ANY (ARRAY['ativo'::text, 'em_dia'::text]))) AS ativos,
            count(*) FILTER (WHERE (a.status = ANY (ARRAY['em_atraso'::text, 'vencido'::text]))) AS risco,
            count(*) FILTER (WHERE ((a.status = 'quitado'::text) OR (a.status_financeiro = 'quitado'::text))) AS quitados,
            sum(COALESCE(a.valor_acordado, (0)::numeric)) FILTER (WHERE ((a.status = 'quitado'::text) OR (a.status_financeiro = 'quitado'::text))) AS recuperado
           FROM acordos a
          GROUP BY a.carteira_id
        ), mensagens_base AS (
         SELECT m.carteira_id,
            count(*) AS mensagens,
            count(*) FILTER (WHERE ((m.status_operacional = 'enviada'::text) OR (m.status = 'enviada'::text))) AS enviadas,
            count(*) FILTER (WHERE ((m.status_operacional = 'falha'::text) OR (m.status = 'falha'::text))) AS falhas,
            count(*) FILTER (WHERE (m.status_operacional = ANY (ARRAY['rascunho'::text, 'pendente_aprovacao'::text, 'aprovada'::text, 'agendada'::text, 'aguardando_retorno'::text]))) AS pendentes
           FROM mensagens m
          GROUP BY m.carteira_id
        ), lotes_base AS (
         SELECT l.carteira_id,
            count(*) AS lotes,
            count(*) FILTER (WHERE (l.status = ANY (ARRAY['gerado'::text, 'pendente_aprovacao'::text, 'processando'::text, 'aprovado'::text]))) AS lotes_ativos,
            count(*) FILTER (WHERE (l.status = 'erro'::text)) AS lotes_erro
           FROM lotes l
          WHERE (l.tipo = ANY (ARRAY['regua_cobranca'::text, 'regua_acordo'::text, 'mensageria'::text]))
          GROUP BY l.carteira_id
        )
 SELECT COALESCE(cb.carteira_id, ab.carteira_id, mb.carteira_id, lb.carteira_id) AS carteira_id,
    COALESCE(cb.cobrancas, (0)::bigint) AS cobrancas,
    COALESCE(cb.abertas, (0)::bigint) AS abertas,
    COALESCE(cb.negociacao, (0)::bigint) AS negociacao,
    COALESCE(cb.em_acordo, (0)::bigint) AS em_acordo,
    COALESCE(cb.efetivadas, (0)::bigint) AS efetivadas,
    COALESCE(cb.valor_total, (0)::numeric) AS valor_total,
    COALESCE(cb.valor_aberto, (0)::numeric) AS valor_aberto,
    COALESCE(cb.atraso_medio, (0)::numeric) AS atraso_medio,
    COALESCE(ab.acordos, (0)::bigint) AS acordos,
    COALESCE(ab.ativos, (0)::bigint) AS acordos_ativos,
    COALESCE(ab.risco, (0)::bigint) AS acordos_risco,
    COALESCE(ab.quitados, (0)::bigint) AS acordos_quitados,
    COALESCE(ab.recuperado, (0)::numeric) AS recuperado,
    COALESCE(mb.mensagens, (0)::bigint) AS mensagens,
    COALESCE(mb.enviadas, (0)::bigint) AS mensagens_enviadas,
    COALESCE(mb.falhas, (0)::bigint) AS mensagens_falhas,
    COALESCE(mb.pendentes, (0)::bigint) AS mensagens_pendentes,
    COALESCE(lb.lotes, (0)::bigint) AS lotes,
    COALESCE(lb.lotes_ativos, (0)::bigint) AS lotes_ativos,
    COALESCE(lb.lotes_erro, (0)::bigint) AS lotes_erro
   FROM (((cobrancas_base cb
     FULL JOIN acordos_base ab ON ((ab.carteira_id = cb.carteira_id)))
     FULL JOIN mensagens_base mb ON ((mb.carteira_id = COALESCE(cb.carteira_id, ab.carteira_id))))
     FULL JOIN lotes_base lb ON ((lb.carteira_id = COALESCE(cb.carteira_id, ab.carteira_id, mb.carteira_id))));

create or replace view public.vw_bi_aging as
 SELECT
        CASE
            WHEN ((dias_atraso >= 0) AND (dias_atraso <= 30)) THEN '0-30'::text
            WHEN ((dias_atraso >= 31) AND (dias_atraso <= 60)) THEN '31-60'::text
            WHEN ((dias_atraso >= 61) AND (dias_atraso <= 90)) THEN '61-90'::text
            WHEN ((dias_atraso >= 91) AND (dias_atraso <= 120)) THEN '91-120'::text
            ELSE '120+'::text
        END AS faixa,
    count(*) AS total,
    sum(valor_atualizado) AS valor
   FROM (SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) cobrancas
  GROUP BY
        CASE
            WHEN ((dias_atraso >= 0) AND (dias_atraso <= 30)) THEN '0-30'::text
            WHEN ((dias_atraso >= 31) AND (dias_atraso <= 60)) THEN '31-60'::text
            WHEN ((dias_atraso >= 61) AND (dias_atraso <= 90)) THEN '61-90'::text
            WHEN ((dias_atraso >= 91) AND (dias_atraso <= 120)) THEN '91-120'::text
            ELSE '120+'::text
        END;

create or replace view public.vw_bi_condominios as
 SELECT co.id AS condominio_id,
    co.nome,
    count(c.id) AS total_cobrancas,
    sum(c.valor_atualizado) AS valor_total,
    avg(c.dias_atraso) AS media_atraso
   FROM ((condominios co
     LEFT JOIN unidades u ON ((u.condominio_id = co.id)))
     LEFT JOIN (SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) c ON ((c.unidade_id = u.id)))
  GROUP BY co.id, co.nome;

create or replace view public.vw_bi_operacional as
 SELECT carteira_id,
    estado,
    count(*) AS total_cobrancas,
    avg(score_recuperacao) AS media_score,
    avg(probabilidade_acordo) AS media_probabilidade
   FROM (SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) cobrancas
  GROUP BY carteira_id, estado;

create or replace view public.vw_bi_status as
 SELECT estado,
    count(*) AS total,
    sum(valor_atualizado) AS valor_total,
    avg(dias_atraso) AS media_atraso
   FROM (SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) cobrancas
  GROUP BY estado;

create or replace view public.vw_carteira_operacional_p43 as
 WITH cobrancas_base AS (
         SELECT c.carteira_id,
            count(*) AS total_cobrancas,
            count(*) FILTER (WHERE (c.status_financeiro = 'em_aberto'::text)) AS cobrancas_abertas,
            count(*) FILTER (WHERE (c.status_operacional = 'em_negociacao'::text)) AS em_negociacao,
            count(*) FILTER (WHERE (c.status_operacional = ANY (ARRAY['acordo_firmado'::text, 'acordo_efetivado'::text]))) AS acordos,
            sum(COALESCE(c.valor_atualizado, c.valor_original, (0)::numeric)) AS valor_total,
            sum(COALESCE(c.valor_atualizado, c.valor_original, (0)::numeric)) FILTER (WHERE (c.status_financeiro = 'em_aberto'::text)) AS valor_em_aberto,
            avg(GREATEST(0, (CURRENT_DATE - c.vencimento))) AS atraso_medio
           FROM (SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) c
          GROUP BY c.carteira_id
        ), mensagens_base AS (
         SELECT m.carteira_id,
            count(*) AS mensagens,
            count(*) FILTER (WHERE (m.status_operacional = 'enviada'::text)) AS enviadas,
            count(*) FILTER (WHERE (m.status_operacional = 'falha'::text)) AS falhas,
            count(*) FILTER (WHERE (m.status_operacional = 'aguardando_retorno'::text)) AS aguardando_retorno
           FROM mensagens m
          GROUP BY m.carteira_id
        ), acordos_base AS (
         SELECT a.carteira_id,
            count(*) AS total_acordos,
            count(*) FILTER (WHERE (a.status = ANY (ARRAY['ativo'::text, 'em_dia'::text]))) AS acordos_ativos,
            count(*) FILTER (WHERE (a.status = ANY (ARRAY['em_atraso'::text, 'vencido'::text]))) AS acordos_risco,
            count(*) FILTER (WHERE ((a.status_financeiro = 'quitado'::text) OR (a.status = 'quitado'::text))) AS acordos_quitados,
            sum(COALESCE(a.valor_acordado, (0)::numeric)) FILTER (WHERE ((a.status_financeiro = 'quitado'::text) OR (a.status = 'quitado'::text))) AS valor_recuperado
           FROM acordos a
          GROUP BY a.carteira_id
        ), lotes_base AS (
         SELECT l.carteira_id,
            count(*) AS total_lotes,
            count(*) FILTER (WHERE (l.status = ANY (ARRAY['gerado'::text, 'processando'::text, 'pendente_aprovacao'::text]))) AS lotes_ativos,
            count(*) FILTER (WHERE (l.status = 'erro'::text)) AS lotes_erro
           FROM lotes l
          WHERE (l.tipo = ANY (ARRAY['regua_cobranca'::text, 'regua_acordo'::text, 'mensageria'::text]))
          GROUP BY l.carteira_id
        )
 SELECT COALESCE(cb.carteira_id, mb.carteira_id, ab.carteira_id, lb.carteira_id) AS carteira_id,
    COALESCE(cb.total_cobrancas, (0)::bigint) AS total_cobrancas,
    COALESCE(cb.cobrancas_abertas, (0)::bigint) AS cobrancas_abertas,
    COALESCE(cb.em_negociacao, (0)::bigint) AS em_negociacao,
    COALESCE(cb.acordos, (0)::bigint) AS acordos,
    COALESCE(cb.valor_total, (0)::numeric) AS valor_total,
    COALESCE(cb.valor_em_aberto, (0)::numeric) AS valor_em_aberto,
    COALESCE(cb.atraso_medio, (0)::numeric) AS atraso_medio,
    COALESCE(mb.mensagens, (0)::bigint) AS mensagens,
    COALESCE(mb.enviadas, (0)::bigint) AS mensagens_enviadas,
    COALESCE(mb.falhas, (0)::bigint) AS mensagens_falha,
    COALESCE(mb.aguardando_retorno, (0)::bigint) AS aguardando_retorno,
    COALESCE(ab.total_acordos, (0)::bigint) AS total_acordos,
    COALESCE(ab.acordos_ativos, (0)::bigint) AS acordos_ativos,
    COALESCE(ab.acordos_risco, (0)::bigint) AS acordos_risco,
    COALESCE(ab.acordos_quitados, (0)::bigint) AS acordos_quitados,
    COALESCE(ab.valor_recuperado, (0)::numeric) AS valor_recuperado,
    COALESCE(lb.total_lotes, (0)::bigint) AS total_lotes,
    COALESCE(lb.lotes_ativos, (0)::bigint) AS lotes_ativos,
    COALESCE(lb.lotes_erro, (0)::bigint) AS lotes_erro
   FROM (((cobrancas_base cb
     FULL JOIN mensagens_base mb ON ((mb.carteira_id = cb.carteira_id)))
     FULL JOIN acordos_base ab ON ((ab.carteira_id = COALESCE(cb.carteira_id, mb.carteira_id))))
     FULL JOIN lotes_base lb ON ((lb.carteira_id = COALESCE(cb.carteira_id, mb.carteira_id, ab.carteira_id))));

create or replace view public.vw_cobrancas_financeiro as
 SELECT id,
    unidade_id,
    condominio_id,
    status_operacional,
    status_financeiro,
    COALESCE(valor_original, (0)::numeric) AS valor_original,
    COALESCE(juros, (0)::numeric) AS juros,
    COALESCE(multa, (0)::numeric) AS multa,
    COALESCE(correcao, (0)::numeric) AS correcao,
    COALESCE(desconto, (0)::numeric) AS desconto,
    ((((COALESCE(valor_original, (0)::numeric) + COALESCE(juros, (0)::numeric)) + COALESCE(multa, (0)::numeric)) + COALESCE(correcao, (0)::numeric)) - COALESCE(desconto, (0)::numeric)) AS valor_atualizado_calculado,
    valor_atualizado,
    observacao_financeira
   FROM (SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) c;

create or replace view public.vw_cobrancas_operacional as
 SELECT c.id,
    c.competencia,
    c.vencimento,
    c.valor_original,
    c.valor_atualizado,
    c.status,
    c.status_financeiro,
    c.updated_at,
    u.id AS unidade_id,
    u.identificacao AS unidade,
    co.id AS condominio_id,
    co.nome AS condominio,
    ca.id AS carteira_id,
    ca.nome AS carteira
   FROM ((((SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) c
     LEFT JOIN unidades u ON ((u.id = c.unidade_id)))
     LEFT JOIN condominios co ON ((co.id = c.condominio_id)))
     LEFT JOIN carteiras ca ON ((ca.id = c.carteira_id)));

create or replace view public.vw_cockpit_experimental as
 SELECT id,
    carteira_id,
    unidade_id,
    estado,
    valor_original,
    valor_atualizado,
    dias_atraso,
    calcular_score_cobranca(dias_atraso, (estado)::text) AS score_ia,
    classificar_cobranca_ia(calcular_score_cobranca(dias_atraso, (estado)::text), (estado)::text, dias_atraso) AS classificacao_ia,
    recomendar_acao_ia(classificar_cobranca_ia(calcular_score_cobranca(dias_atraso, (estado)::text), (estado)::text, dias_atraso)) AS recomendacao_ia,
    created_at
   FROM (SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) c;

create or replace view public.vw_cockpit_inteligente as
 SELECT id,
    carteira_id,
    unidade_id,
    estado,
    score_recuperacao,
    probabilidade_acordo,
    ultima_interacao_em,
    proxima_acao_em,
        CASE
            WHEN (estado = 'acordo_inadimplente'::estado_cobranca) THEN 'critico'::text
            WHEN (estado = 'judicializado'::estado_cobranca) THEN 'juridico'::text
            WHEN (probabilidade_acordo >= (80)::numeric) THEN 'alta_conversao'::text
            WHEN (score_recuperacao <= (30)::numeric) THEN 'baixo_potencial'::text
            ELSE 'operacional'::text
        END AS prioridade_ia
   FROM (SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) c;

create or replace view public.vw_cockpit_operacional_core as
 SELECT c.id,
    c.carteira_id,
    'cobranca'::text AS tipo_item,
    c.status_operacional,
    c.status_financeiro,
    c.valor_atualizado AS valor_referencia,
    c.vencimento AS data_referencia,
    c.ultima_interacao_at,
    COALESCE(c.dias_atraso, GREATEST(0, (CURRENT_DATE - c.vencimento))) AS dias_atraso,
    c.score_prioridade,
    COALESCE(u.responsavel_nome, 'Responsável não informado'::text) AS responsavel_nome,
    u.identificacao AS unidade_identificacao,
    co.nome AS condominio_nome,
        CASE
            WHEN (c.status_operacional = 'em_negociacao'::text) THEN 'Fechar acordo'::text
            WHEN (c.status_operacional = 'em_cobranca_ativa'::text) THEN 'Propor acordo'::text
            WHEN (c.status_operacional = 'novo'::text) THEN 'Iniciar contato'::text
            WHEN (c.status_operacional = 'acordo_firmado'::text) THEN 'Acompanhar acordo vinculado'::text
            WHEN (c.status_operacional = 'judicializado'::text) THEN 'Monitorar judicialização'::text
            WHEN (c.status_operacional = 'suspenso'::text) THEN 'Revisar suspensão'::text
            ELSE 'Acompanhar cobrança'::text
        END AS proxima_acao,
    now() AS refreshed_at
   FROM (((SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) c
     LEFT JOIN unidades u ON ((u.id = c.unidade_id)))
     LEFT JOIN condominios co ON ((co.id = c.condominio_id)))
  WHERE (c.status_operacional = ANY (ARRAY['novo'::text, 'em_cobranca_ativa'::text, 'em_negociacao'::text, 'acordo_firmado'::text, 'judicializado'::text, 'suspenso'::text]))
UNION ALL
 SELECT a.id,
    a.carteira_id,
    'acordo'::text AS tipo_item,
    a.status AS status_operacional,
    a.status_financeiro,
    a.valor_acordado AS valor_referencia,
    COALESCE(min(ap.vencimento), a.data_acordo) AS data_referencia,
    NULL::timestamp with time zone AS ultima_interacao_at,
    GREATEST(0, (CURRENT_DATE - COALESCE(min(ap.vencimento), a.data_acordo))) AS dias_atraso,
    NULL::numeric AS score_prioridade,
    COALESCE(u.responsavel_nome, 'Responsável não informado'::text) AS responsavel_nome,
    u.identificacao AS unidade_identificacao,
    co.nome AS condominio_nome,
        CASE
            WHEN (a.status = ANY (ARRAY['em_atraso'::text, 'vencido'::text])) THEN 'Cobrar parcela em atraso'::text
            WHEN (min(ap.vencimento) <= CURRENT_DATE) THEN 'Confirmar pagamento da parcela'::text
            WHEN (min(ap.vencimento) <= (CURRENT_DATE + '3 days'::interval)) THEN 'Lembrar vencimento da parcela'::text
            ELSE 'Monitorar cumprimento'::text
        END AS proxima_acao,
    now() AS refreshed_at
   FROM (((acordos a
     LEFT JOIN acordos_parcelas ap ON (((ap.acordo_id = a.id) AND (ap.status = ANY (ARRAY['pendente'::text, 'vencida'::text])))))
     LEFT JOIN unidades u ON ((u.id = a.unidade_id)))
     LEFT JOIN condominios co ON ((co.id = a.condominio_id)))
  WHERE (a.status = ANY (ARRAY['ativo'::text, 'em_dia'::text, 'em_atraso'::text, 'vencido'::text]))
  GROUP BY a.id, a.carteira_id, a.status, a.status_financeiro, a.valor_acordado, a.data_acordo, u.responsavel_nome, u.identificacao, co.nome;

create or replace view public.vw_cockpit_sindico_avancado as
 SELECT c.id AS cobranca_id,
    c.carteira_id,
    c.unidade_id,
    u.condominio_id,
    co.nome AS condominio_nome,
    COALESCE((c.estado)::text, c.status, 'sem_status'::text) AS estado_operacional,
    COALESCE(c.valor_atualizado, c.valor_original, (0)::numeric) AS valor,
    COALESCE(c.dias_atraso, 0) AS dias_atraso,
        CASE
            WHEN (COALESCE(c.dias_atraso, 0) > 120) THEN 'critico'::text
            WHEN (COALESCE(c.dias_atraso, 0) > 60) THEN 'atencao'::text
            WHEN (COALESCE((c.estado)::text, c.status, ''::text) = ANY (ARRAY['negociando'::text, 'acordo_gerado'::text, 'acordo_ativo'::text])) THEN 'oportunidade'::text
            ELSE 'operacional'::text
        END AS classificacao_ia,
        CASE
            WHEN (COALESCE(c.dias_atraso, 0) > 120) THEN 'Separar casos para plano de ação prioritário'::text
            WHEN (COALESCE(c.dias_atraso, 0) > 60) THEN 'Reforçar tentativa de negociação amigável'::text
            WHEN (COALESCE((c.estado)::text, c.status, ''::text) = ANY (ARRAY['negociando'::text, 'acordo_gerado'::text, 'acordo_ativo'::text])) THEN 'Acompanhar cumprimento e evitar quebra'::text
            ELSE 'Manter acompanhamento pela régua'::text
        END AS recomendacao_ia,
    c.created_at
   FROM (((SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) c
     LEFT JOIN unidades u ON ((u.id = c.unidade_id)))
     LEFT JOIN condominios co ON ((co.id = u.condominio_id)));

create or replace view public.vw_dashboard_executivo_p41 as
 WITH cobrancas_base AS (
         SELECT c.carteira_id,
            count(*) AS total_cobrancas,
            count(*) FILTER (WHERE (c.status_financeiro = 'em_aberto'::text)) AS cobrancas_abertas,
            count(*) FILTER (WHERE (c.status_operacional = 'em_negociacao'::text)) AS em_negociacao,
            count(*) FILTER (WHERE (c.status_operacional = 'acordo_firmado'::text)) AS acordos_firmados,
            count(*) FILTER (WHERE (c.status_operacional = 'acordo_efetivado'::text)) AS acordos_efetivados,
            sum(COALESCE(c.valor_atualizado, c.valor_original, (0)::numeric)) FILTER (WHERE (c.status_financeiro = 'em_aberto'::text)) AS valor_em_aberto,
            avg(GREATEST(0, (CURRENT_DATE - c.vencimento))) AS atraso_medio_dias
           FROM (SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) c
          GROUP BY c.carteira_id
        ), acordos_base AS (
         SELECT a.carteira_id,
            count(*) AS total_acordos,
            count(*) FILTER (WHERE (a.status = ANY (ARRAY['ativo'::text, 'em_dia'::text]))) AS acordos_ativos,
            count(*) FILTER (WHERE (a.status = ANY (ARRAY['em_atraso'::text, 'vencido'::text]))) AS acordos_em_risco,
            count(*) FILTER (WHERE (a.status_financeiro = 'quitado'::text)) AS acordos_quitados,
            sum(COALESCE(a.valor_acordado, (0)::numeric)) FILTER (WHERE ((a.status_financeiro = 'quitado'::text) OR (a.status = 'quitado'::text))) AS valor_recuperado
           FROM acordos a
          GROUP BY a.carteira_id
        )
 SELECT COALESCE(cb.carteira_id, ab.carteira_id) AS carteira_id,
    COALESCE(cb.total_cobrancas, (0)::bigint) AS total_cobrancas,
    COALESCE(cb.cobrancas_abertas, (0)::bigint) AS cobrancas_abertas,
    COALESCE(cb.em_negociacao, (0)::bigint) AS em_negociacao,
    COALESCE(cb.acordos_firmados, (0)::bigint) AS acordos_firmados,
    COALESCE(cb.acordos_efetivados, (0)::bigint) AS acordos_efetivados,
    COALESCE(cb.valor_em_aberto, (0)::numeric) AS valor_em_aberto,
    COALESCE(cb.atraso_medio_dias, (0)::numeric) AS atraso_medio_dias,
    COALESCE(ab.total_acordos, (0)::bigint) AS total_acordos,
    COALESCE(ab.acordos_ativos, (0)::bigint) AS acordos_ativos,
    COALESCE(ab.acordos_em_risco, (0)::bigint) AS acordos_em_risco,
    COALESCE(ab.acordos_quitados, (0)::bigint) AS acordos_quitados,
    COALESCE(ab.valor_recuperado, (0)::numeric) AS valor_recuperado
   FROM (cobrancas_base cb
     FULL JOIN acordos_base ab ON ((ab.carteira_id = cb.carteira_id)));

create or replace view public.vw_funil_operacional_p42 as
 WITH cobrancas_base AS (
         SELECT c.id,
            c.carteira_id,
            c.operador_id,
            COALESCE(c.valor_atualizado, c.valor_original, (0)::numeric) AS valor,
            c.status_operacional,
            c.status_financeiro,
            c.ultima_interacao_at,
            c.created_at
           FROM (SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) c
        ), mensagens_base AS (
         SELECT DISTINCT m.cobranca_id
           FROM mensagens m
          WHERE (m.cobranca_id IS NOT NULL)
        ), acordos_base AS (
         SELECT a.carteira_id,
            a.cobranca_id,
            max(
                CASE
                    WHEN ((a.status = 'quitado'::text) OR (a.status_financeiro = 'quitado'::text)) THEN 1
                    ELSE 0
                END) AS acordo_quitado
           FROM acordos a
          WHERE (a.cobranca_id IS NOT NULL)
          GROUP BY a.carteira_id, a.cobranca_id
        ), marcada AS (
         SELECT cb.id,
            cb.carteira_id,
            cb.operador_id,
            cb.valor,
            cb.status_operacional,
            cb.status_financeiro,
            cb.ultima_interacao_at,
            cb.created_at,
                CASE
                    WHEN ((mb.cobranca_id IS NOT NULL) OR (cb.ultima_interacao_at IS NOT NULL) OR (cb.status_operacional = ANY (ARRAY['em_cobranca_ativa'::text, 'em_negociacao'::text, 'acordo_firmado'::text, 'acordo_efetivado'::text]))) THEN 1
                    ELSE 0
                END AS tem_contato,
                CASE
                    WHEN ((cb.status_operacional = ANY (ARRAY['em_negociacao'::text, 'acordo_firmado'::text, 'acordo_efetivado'::text])) OR (ab.cobranca_id IS NOT NULL)) THEN 1
                    ELSE 0
                END AS tem_negociacao,
                CASE
                    WHEN ((cb.status_operacional = ANY (ARRAY['acordo_firmado'::text, 'acordo_efetivado'::text])) OR (ab.cobranca_id IS NOT NULL)) THEN 1
                    ELSE 0
                END AS tem_acordo,
                CASE
                    WHEN ((cb.status_operacional = 'acordo_efetivado'::text) OR (COALESCE(ab.acordo_quitado, 0) = 1)) THEN 1
                    ELSE 0
                END AS tem_efetivacao
           FROM ((cobrancas_base cb
             LEFT JOIN mensagens_base mb ON ((mb.cobranca_id = cb.id)))
             LEFT JOIN acordos_base ab ON ((ab.cobranca_id = cb.id)))
        )
 SELECT carteira_id,
    count(*) AS etapa_cobranca,
    count(*) FILTER (WHERE (tem_contato = 1)) AS etapa_contato,
    count(*) FILTER (WHERE (tem_negociacao = 1)) AS etapa_negociacao,
    count(*) FILTER (WHERE (tem_acordo = 1)) AS etapa_acordo,
    count(*) FILTER (WHERE (tem_efetivacao = 1)) AS etapa_efetivado,
    sum(valor) AS valor_cobranca,
    sum(valor) FILTER (WHERE (tem_contato = 1)) AS valor_contato,
    sum(valor) FILTER (WHERE (tem_negociacao = 1)) AS valor_negociacao,
    sum(valor) FILTER (WHERE (tem_acordo = 1)) AS valor_acordo,
    sum(valor) FILTER (WHERE (tem_efetivacao = 1)) AS valor_efetivado,
    round((((count(*) FILTER (WHERE (tem_contato = 1)))::numeric / (NULLIF(count(*), 0))::numeric) * (100)::numeric), 2) AS taxa_contato,
    round((((count(*) FILTER (WHERE (tem_negociacao = 1)))::numeric / (NULLIF(count(*), 0))::numeric) * (100)::numeric), 2) AS taxa_negociacao,
    round((((count(*) FILTER (WHERE (tem_acordo = 1)))::numeric / (NULLIF(count(*), 0))::numeric) * (100)::numeric), 2) AS taxa_acordo,
    round((((count(*) FILTER (WHERE (tem_efetivacao = 1)))::numeric / (NULLIF(count(*), 0))::numeric) * (100)::numeric), 2) AS taxa_efetivacao
   FROM marcada
  GROUP BY carteira_id;

create or replace view public.vw_mensageria_fila_operacional as
 SELECT m.id,
    m.carteira_id,
    m.contexto,
    m.cobranca_id,
    m.acordo_id,
    m.canal,
    m.status,
    m.status_operacional,
    m.destinatario,
    m.conteudo,
    m.created_at,
    m.scheduled_at,
    m.sent_at,
    m.agendada_para,
    m.enviada_em,
    m.aprovado_por,
    m.aprovado_em,
    m.cancelado_por,
    m.cancelado_em,
    m.motivo_cancelamento,
    m.lote_id,
    m.lote_item_id,
    co.nome AS condominio_nome,
    u.identificacao AS unidade
   FROM (((mensagens m
     LEFT JOIN (SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) c ON ((c.id = m.cobranca_id)))
     LEFT JOIN unidades u ON ((u.id = c.unidade_id)))
     LEFT JOIN condominios co ON ((co.id = u.condominio_id)));

create or replace view public.vw_portal_sindico_cobrancas as
 SELECT c.id AS cobranca_id,
    c.status,
    c.estado,
    c.valor_original,
    c.valor_atualizado,
    c.dias_atraso,
    c.created_at,
    u.id AS unidade_id,
    u.identificacao AS unidade,
    co.id AS condominio_id,
    co.nome AS condominio_nome
   FROM (((SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) c
     LEFT JOIN unidades u ON ((u.id = c.unidade_id)))
     LEFT JOIN condominios co ON ((co.id = u.condominio_id)));

create or replace view public.vw_portal_sindico_resumo as
 SELECT co.id AS condominio_id,
    co.nome AS condominio_nome,
    count(c.id) AS total_cobrancas,
    sum(COALESCE(c.valor_atualizado, c.valor_original, (0)::numeric)) AS valor_total,
    avg(COALESCE(c.dias_atraso, 0)) AS media_atraso
   FROM ((condominios co
     LEFT JOIN unidades u ON ((u.condominio_id = co.id)))
     LEFT JOIN (SELECT * FROM public.cobrancas WHERE duplicada_de_id IS NULL) c ON ((c.unidade_id = u.id)))
  GROUP BY co.id, co.nome;

CREATE OR REPLACE FUNCTION public.criar_acordo_financeiro(p_carteira_id uuid, p_cobranca_id uuid, p_condominio_id uuid, p_unidade_id uuid, p_tipo text, p_numero_processo text, p_valor_acordado numeric, p_entrada numeric, p_despesa_cobranca_percentual numeric, p_despesa_cobranca_valor numeric, p_data_acordo date, p_status text, p_fluxo_status text, p_exige_aprovacao_sindico boolean, p_documento_url text, p_observacoes text, p_itens jsonb, p_parcelas jsonb, p_cobranca_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_acordo_id uuid;
  v_itens_count integer;
  v_updated_count integer;
  v_status_check text;
  v_cobranca_status_legado text;
begin
  if p_carteira_id is null then
    raise exception 'Carteira obrigatoria.';
  end if;

  if p_cobranca_id is null then
    raise exception 'Cobranca principal obrigatoria.';
  end if;

  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Itens de acordo obrigatorios.';
  end if;

  if jsonb_typeof(p_parcelas) is distinct from 'array' or jsonb_array_length(p_parcelas) = 0 then
    raise exception 'Parcelas de acordo obrigatorias.';
  end if;

  select count(*)
    into v_itens_count
  from jsonb_to_recordset(p_itens) as item(cobranca_id uuid);

  if exists (
    select 1
    from jsonb_to_recordset(p_itens) as item(cobranca_id uuid)
    left join public.cobrancas c on c.id = item.cobranca_id
    where c.id is null or c.duplicada_de_id is not null
      or c.carteira_id is distinct from p_carteira_id
      or c.condominio_id is distinct from p_condominio_id
      or c.unidade_id is distinct from p_unidade_id
  ) then
    raise exception 'As cobrancas do acordo precisam existir e pertencer a mesma carteira, condominio e unidade.';
  end if;

  select pg_get_constraintdef(oid)
    into v_status_check
  from pg_constraint
  where conrelid = 'public.cobrancas'::regclass
    and conname = 'cobrancas_status_check'
  limit 1;

  v_cobranca_status_legado := p_cobranca_status;

  if v_status_check is not null
     and v_status_check not ilike '%' || p_cobranca_status || '%'
     and v_status_check ilike '%' || replace(p_cobranca_status, '_', ' ') || '%'
  then
    v_cobranca_status_legado := replace(p_cobranca_status, '_', ' ');
  end if;

  perform 1
  from public.cobrancas c
  where c.id in (
    select item.cobranca_id
    from jsonb_to_recordset(p_itens) as item(cobranca_id uuid)
  )
  for update;

  insert into public.acordos (
    carteira_id,
    cobranca_id,
    condominio_id,
    unidade_id,
    tipo,
    numero_processo,
    valor_acordado,
    entrada,
    despesa_cobranca_percentual,
    despesa_cobranca_valor,
    data_acordo,
    status,
    fluxo_status,
    exige_aprovacao_sindico,
    documento_url,
    observacoes
  )
  values (
    p_carteira_id,
    p_cobranca_id,
    p_condominio_id,
    p_unidade_id,
    p_tipo,
    nullif(p_numero_processo, ''),
    p_valor_acordado,
    p_entrada,
    p_despesa_cobranca_percentual,
    p_despesa_cobranca_valor,
    p_data_acordo,
    p_status,
    p_fluxo_status,
    coalesce(p_exige_aprovacao_sindico, false),
    nullif(p_documento_url, ''),
    nullif(p_observacoes, '')
  )
  returning id into v_acordo_id;

  insert into public.acordo_cobrancas (
    acordo_id,
    cobranca_id,
    valor_original_no_acordo,
    valor_atualizado_no_acordo,
    encargos_no_acordo,
    valor_total_no_acordo
  )
  select
    v_acordo_id,
    item.cobranca_id,
    coalesce(item.valor_original_no_acordo, 0),
    coalesce(item.valor_atualizado_no_acordo, 0),
    coalesce(item.encargos_no_acordo, 0),
    coalesce(item.valor_total_no_acordo, 0)
  from jsonb_to_recordset(p_itens) as item(
    cobranca_id uuid,
    valor_original_no_acordo numeric,
    valor_atualizado_no_acordo numeric,
    encargos_no_acordo numeric,
    valor_total_no_acordo numeric
  );

  insert into public.parcelas_acordo (
    acordo_id,
    numero,
    tipo_parcela,
    valor,
    vencimento,
    status
  )
  select
    v_acordo_id,
    parcela.numero,
    coalesce(parcela.tipo_parcela, 'parcela'),
    parcela.valor,
    parcela.vencimento,
    coalesce(parcela.status, 'aberta')
  from jsonb_to_recordset(p_parcelas) as parcela(
    numero integer,
    tipo_parcela text,
    valor numeric,
    vencimento date,
    status text
  );

  update public.cobrancas c
     set status = v_cobranca_status_legado,
         status_operacional = p_cobranca_status
   where c.id in (
    select item.cobranca_id
    from jsonb_to_recordset(p_itens) as item(cobranca_id uuid)
  );

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> v_itens_count then
    raise exception 'Nem todas as cobrancas do acordo foram atualizadas.';
  end if;

  return v_acordo_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.flow_cobranca_mensagem_elegivel(m mensagens)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select not public.mensagem_contem_cobranca_arquivada(m) and (m.cobranca_flow_id is null or (
 m.cobranca_id is not null and exists(select 1 from cobrancas where id=m.cobranca_id)
 and not exists (
 select 1 from cobrancas c left join unidades u on u.id=c.unidade_id
 where (c.id=m.cobranca_id or coalesce(m.payload->'cobranca_ids','[]'::jsonb) @> jsonb_build_array(c.id::text))
 and (coalesce(c.status_operacional,c.status,'') <> 'em_cobranca_ativa'
 or c.status in ('possivel_acordo','acordo_firmado','acordo_efetivado','pre_juridico','judicializado','suspenso')
 or c.status_financeiro in ('quitado','renegociado') or c.automacao_bloqueada or u.acao_judicial)
 )));
$function$
;

CREATE OR REPLACE FUNCTION public.maestro_flow_ativar(p_flow uuid, p_remetente text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare q maestro_flow_ativacoes; f cobranca_flows; n int;
begin
 perform pg_advisory_xact_lock(9162026,50);
 select * into q from maestro_flow_ativacoes where flow_id=p_flow for update;
 if not found or q.status<>'pendente' then return 'ignorado'; end if;
 perform 1 from maestro_flow_controle where carteira_id=q.carteira_id for share;
 if exists(select 1 from automacao_controle where chave='captacao_global' and not ativo)
 or not exists(select 1 from maestro_flow_controle where carteira_id=q.carteira_id and ativo) then return 'pausado'; end if;
 select * into strict f from cobranca_flows where id=p_flow for update;
 if f.status<>'pronto' then
   update maestro_flow_ativacoes set status='manual',updated_at=now() where flow_id=p_flow;
   return 'manual';
 end if;
 begin
   if f.payload->>'origem' is distinct from 'maestro' or f.carteira_id<>q.carteira_id then raise exception 'Origem ou carteira do flow alterada.'; end if;
   if not exists(select 1 from condominios where id=(f.payload->>'condominio_id')::uuid and carteira_id=f.carteira_id and status='ativo') then raise exception 'CondomÃƒÆ’Ã‚Â­nio inativo ou carteira alterada.'; end if;
   if exists(select 1 from lote_itens i join cobrancas c on c.id=i.cobranca_id
     where i.cobranca_flow_id=f.id and i.status in ('criado','aprovado') and
     ((c.automacao_bloqueada or c.duplicada_de_id is not null) or c.status_operacional not in ('novo','em_cobranca_ativa')
     or c.status_financeiro in ('quitado','renegociado','cancelado')
     or c.status in ('possivel_acordo','acordo_firmado','acordo_efetivado','pre_juridico','judicializado','suspenso')
     or c.carteira_id<>f.carteira_id or c.condominio_id<>(f.payload->>'condominio_id')::uuid
     or exists(select 1 from acordos a where a.cobranca_id=c.id and a.status in ('ativo','em_dia','em_atraso'))
     or exists(select 1 from acordo_cobrancas ac join acordos a on a.id=ac.acordo_id where ac.cobranca_id=c.id and a.status in ('ativo','em_dia','em_atraso'))))
     then raise exception 'CobranÃƒÆ’Ã‚Â§a bloqueada, com acordo ou alterada; conferir antes de ativar.'; end if;
   if exists(select 1 from mensagens where cobranca_flow_id=f.id and canal<>'email') then raise exception 'Canal fora da montagem automÃƒÆ’Ã‚Â¡tica de e-mail; ativaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o manual necessÃƒÆ’Ã‚Â¡ria.'; end if;
   if exists(select 1 from mensagens where cobranca_flow_id=f.id and
     (status<>'pendente_aprovacao' or coalesce(nullif(email_destinatario,''),destinatario,'') !~ '^[^[:space:]@;,]+@[^[:space:]@;,]+[.][^[:space:]@;,]+$')) then
     raise exception 'Mensagem alterada ou destinatÃ¡rio invÃ¡lido; conferir antes de ativar.';
   end if;
   n := email_ativar_flow(f.id,p_remetente,null);
   update maestro_flow_ativacoes set status='ativado',erro=null,updated_at=now() where flow_id=f.id;
   return 'ativado';
 exception when others then
   update maestro_flow_ativacoes set status='atencao',erro=sqlerrm,updated_at=now() where flow_id=f.id;
   return 'atencao';
 end;
end $function$
;

CREATE OR REPLACE FUNCTION public.maestro_flow_finalizar(p_job uuid, p_token uuid, p_nome text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare j public.maestro_flow_montagens; f uuid; total integer; falhas integer; ids uuid[];
begin
 select * into strict j from maestro_flow_montagens where id=p_job for update;
 if j.token is distinct from p_token or j.status<>'processando' or j.lease_ate<now() then raise exception 'Reserva da montagem expirada.'; end if;
 if j.lote_id is null then raise exception 'Lote não preparado.'; end if;
 if not exists(select 1 from condominios where id=j.condominio_id and carteira_id=j.carteira_id and status='ativo') then raise exception 'Condomínio inativo ou carteira alterada.'; end if;
 if exists(select 1 from lote_itens i join cobrancas c on c.id=i.cobranca_id where i.lote_id=j.lote_id and i.status='criado' and
   ((c.automacao_bloqueada or c.duplicada_de_id is not null) or c.status_operacional not in ('novo','em_cobranca_ativa') or c.status_financeiro in ('quitado','renegociado')
    or c.status in ('possivel_acordo','acordo_firmado','acordo_efetivado','pre_juridico','judicializado','suspenso')
    or c.carteira_id<>j.carteira_id or c.condominio_id<>j.condominio_id
    or exists(select 1 from acordos a where a.cobranca_id=c.id and a.status in ('ativo','em_dia','em_atraso')))) then raise exception 'Cobrança bloqueada ou alterada durante a montagem; revisar antes de prosseguir.'; end if;
 select count(*) into total from mensagens where lote_id=j.lote_id;
 if total>20 then raise exception 'Mais de 20 mensagens: revisar a unidade antes de liberar o Flow.'; end if;
 if exists(select 1 from mensagens where lote_id=j.lote_id and (status<>'pendente_aprovacao' or cobranca_flow_id is not null)) then raise exception 'Mensagens alteradas durante a montagem.'; end if;
 select count(*) into falhas from lote_itens where lote_id=j.lote_id and status='erro';
 select array_agg(value::uuid) into ids from jsonb_array_elements_text(j.plano->j.parte);
 insert into cobranca_flows(carteira_id,lote_id,regua_id,nome,status,total_mensagens,total_pendentes,total_falhas,payload)
 values(j.carteira_id,j.lote_id,j.regua_id,p_nome,case when total>0 then 'pronto' when falhas>0 then 'concluido_com_falhas' else 'concluido' end,total,total,falhas,
 jsonb_build_object('contexto','flow_cobranca','origem','maestro','montagem_id',j.id,'condominio_id',j.condominio_id,'cobranca_ids',ids,'parte',j.parte+1)) returning id into f;
 update mensagens set cobranca_flow_id=f,agendada_para=null,scheduled_at=null where lote_id=j.lote_id;
 update lote_itens set cobranca_flow_id=f where lote_id=j.lote_id;
 update cobrancas set status='em_cobranca_ativa',status_operacional='em_cobranca_ativa'
 where id=any(ids) and status_operacional='novo' and exists(select 1 from lote_itens i where i.lote_id=j.lote_id and i.cobranca_id=cobrancas.id and i.status='criado');
 update maestro_flow_montagens set flow_ids=array_append(flow_ids,f),parte=parte+1,lote_id=null,
 pendencias=pendencias||coalesce((select jsonb_agg(jsonb_build_object('cobranca_id',i.cobranca_id,'motivo',coalesce(i.motivo,i.status),'saneamento',false)) from lote_itens i where i.lote_id=j.lote_id and i.status<>'criado'),'[]'::jsonb),
 status=case when parte+1>=jsonb_array_length(plano) then 'concluido' else 'pendente' end,
 token=null,lease_ate=null,tentativas=0,erro=null,updated_at=now() where id=j.id;
 return f;
end $function$
;

CREATE OR REPLACE FUNCTION public.propagar_acao_judicial_da_unidade()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.acao_judicial and not old.acao_judicial then
    update public.cobrancas
       set status = 'judicializado',
           status_operacional = 'judicializado'
     where unidade_id = new.id and duplicada_de_id is null
       and coalesce(status_operacional, status, 'novo') in (
         'novo', 'em_cobranca_ativa', 'em_negociacao', 'possivel_acordo', 'pre_juridico'
       );
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sincronizar_judicializacao_pre_juridico()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if ((new.distribuicao_status = 'distribuido' and old.distribuicao_status is distinct from new.distribuicao_status)
      or (new.etapa = 'judicializado' and old.etapa is distinct from new.etapa))
     and new.unidade_id is not null then
    update public.unidades
       set acao_judicial = true
     where id = new.unidade_id;

    update public.cobrancas
       set status = 'judicializado',
           status_operacional = 'judicializado'
     where unidade_id = new.unidade_id and duplicada_de_id is null
       and lower(coalesce(status_financeiro, '')) not in ('quitado', 'pago', 'cancelado');
  end if;
  return new;
end;
$function$
;

commit;
