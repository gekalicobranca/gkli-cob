'use server'

import { randomUUID } from 'node:crypto'
import { createClient } from '@/utils/supabase/server'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { applyCarteiraIdsScope } from '@/utils/auth/carteira-scope'
import { somenteCobrancasCanonicas } from '@/lib/core/cobranca-arquivamento'
import { type TvCharge, type TvAgreement, type TvInstallment } from './tv-metrics'
import { buildTvSlides } from './tv-slides'
import { collectTvRelevantAgreementIds, prepareTvCollectionCharges, TV_COLLECTION_AGREEMENT_STATUSES, type TvAgreementLink } from './tv-collection'
import { TV_PAID_INSTALLMENT_STATUSES } from './tv-metrics'

export async function getTvClosingResults(periodId = '') {
  await getPermittedCarteiras()
  const db = await createClient()
  const { data, error } = await db.from('fechamento_periodos')
    .select('id,competencia,data_abertura,data_fechamento,status')
    .neq('status', 'cancelado')
    .order('data_abertura', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error('Não foi possível consultar os períodos de fechamento.')
  const periods = (data ?? []) as Array<{ id: string; competencia: string; data_abertura: string; data_fechamento: string; status: string }>
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const period = periodId
    ? periods.find(item => item.id === periodId)
    : periods.find(item => item.data_abertura <= today && item.data_fechamento >= today)
      ?? periods.find(item => item.data_abertura <= today)
  if (!period) throw new Error(periodId ? 'Fechamento indisponível. Selecione outro período.' : 'Nenhum período de fechamento disponível para exibição.')
  const results = await getTvResults(period.data_abertura, period.data_fechamento)
  return { ...results, period, periods }
}

export async function getTvResults(start: string, end: string, selection?: { carteiraId?: string; condominioId?: string }) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  if (!valid(start) || !valid(end) || start > end || Date.parse(end) - Date.parse(start) >= 366 * 86400000) throw new Error('Selecione um período válido de até 366 dias.')
  const scope = await getPermittedCarteiras()
  const db = await createClient()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const nextDay = new Date(Date.parse(end) + 86400000).toISOString().slice(0, 10)
  const requestId = randomUUID()
  const agreementFields = 'id,tipo,cobranca_id,carteira_id,condominio_id,data_acordo,valor_acordado,observacoes,status,status_financeiro,fluxo_status,boletos_solicitados_em,despesa_cobranca_valor,despesa_cobranca_percentual,acordo_homologado,origem_controle'
  const installmentAgreementFields = 'id,tipo,carteira_id,condominio_id,valor_acordado,observacoes,status,fluxo_status,boletos_solicitados_em,despesa_cobranca_valor,despesa_cobranca_percentual,acordo_homologado,origem_controle'
  function applySelection(query: any, relation?: string) {
    const prefix = relation ? `${relation}.` : ''
    if (selection?.carteiraId) query = query.eq(`${prefix}carteira_id`, selection.carteiraId)
    if (selection?.condominioId) query = query.eq(`${prefix}condominio_id`, selection.condominioId)
    return query
  }
  function reportPageFailure(query: string, offset: number, durationMs: number, error: unknown) {
    const record = error && typeof error === 'object' ? error as { code?: unknown; status?: unknown } : null
    console.error('[dashboard-tv] query_page_failed', {
      requestId, query, page: Math.floor(offset / 1000) + 1, offset, limit: 1000, durationMs,
      code: typeof record?.code === 'string' ? record.code : undefined,
      status: typeof record?.status === 'number' ? record.status : undefined,
    })
  }
  async function pages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, query: string, label: string) {
    const rows: T[] = []
    for (let offset = 0; ; offset += 1000) {
      const startedAt = Date.now()
      let result: { data: T[] | null; error: unknown }
      try {
        result = await fetchPage(offset, offset + 999)
      } catch (error) {
        reportPageFailure(query, offset, Date.now() - startedAt, error)
        throw new Error(`Não foi possível consultar ${label}.`)
      }
      const durationMs = Date.now() - startedAt
      if (result.error || !result.data) {
        reportPageFailure(query, offset, durationMs, result.error)
        throw new Error(`Não foi possível consultar ${label}.`)
      }
      const { data } = result
      if (durationMs >= 1000) {
        console.warn('[dashboard-tv] query_page_slow', {
          requestId, query, page: Math.floor(offset / 1000) + 1, offset, limit: 1000,
          durationMs, rows: data.length,
        })
      }
      rows.push(...data)
      if (data.length < 1000) return rows
    }
  }
  const [charges, agreements, installments, wallets, judicialRows, condominiums] = await Promise.all([
    pages<TvCharge>((from, to) => {
      let query = somenteCobrancasCanonicas(db.from('cobrancas')
        .select('id,carteira_id,condominio_id,unidade_id,valor_atualizado,vencimento,status,status_operacional,status_financeiro,unidades(acao_judicial)'))
        .eq('excluida_por_cessao_espaco', false)
        .lte('vencimento', today < end ? today : end)
        .or('status_operacional.in.(novo,em_cobranca_ativa,em_negociacao,possivel_acordo),status_operacional.is.null')
      query = applyCarteiraIdsScope(query, scope.carteiraIds)
      return applySelection(query).order('id').range(from, to)
    }, 'charges', 'a captação'),
    pages<TvAgreement>((from, to) => {
      let query = db.from('acordos').select(agreementFields).eq('tipo', 'extrajudicial')
        .or(`and(data_acordo.gte.${start},data_acordo.lt.${nextDay}),data_acordo.eq.${today},status.in.(${TV_COLLECTION_AGREEMENT_STATUSES.join(',')})`)
      query = applyCarteiraIdsScope(query, scope.carteiraIds)
      return applySelection(query).order('id').range(from, to)
    }, 'agreements', 'os acordos'),
    pages<TvInstallment>((from, to) => {
      let query = db.from('parcelas_acordo')
        .select(`id,valor,vencimento,status,data_pagamento,valor_repasse_informado,acordos!inner(${installmentAgreementFields})`)
        .eq('acordos.tipo', 'extrajudicial')
        .eq('acordos.origem_controle', 'carteira')
        .or(`and(vencimento.gte.${start},vencimento.lt.${nextDay}),and(data_pagamento.gte.${start},data_pagamento.lt.${nextDay})`)
      query = applyCarteiraIdsScope(query, scope.carteiraIds, 'acordos.carteira_id')
      return applySelection(query, 'acordos').order('id').range(from, to)
    }, 'installments', 'as parcelas'),
    pages<{ id: string; nome: string }>((from, to) => {
      let query = applyCarteiraIdsScope(db.from('carteiras').select('id,nome'), scope.carteiraIds, 'id')
      if (selection?.carteiraId) query = query.eq('id', selection.carteiraId)
      return query.order('id').range(from, to)
    }, 'wallets', 'as carteiras'),
    pages<{ unidade_id: string | null }>((from, to) => {
      let query = somenteCobrancasCanonicas(db.from('cobrancas').select('id,unidade_id'))
        .eq('excluida_por_cessao_espaco', false)
        .or('status_operacional.in.(pre_distribuicao,pre_juridico,judicializado),status.in.(pre_distribuicao,pre_juridico,judicializado)')
      query = applyCarteiraIdsScope(query, scope.carteiraIds)
      return applySelection(query).order('id').range(from, to)
    }, 'judicial_charges', 'os bloqueios jurídicos'),
    pages<{ id: string; grupo: string | null }>((from, to) => {
      let query = applyCarteiraIdsScope(db.from('condominios').select('id,grupo'), scope.carteiraIds)
      if (selection?.carteiraId) query = query.eq('carteira_id', selection.carteiraId)
      if (selection?.condominioId) query = query.eq('id', selection.condominioId)
      return query.order('id').range(from, to)
    }, 'condominiums', 'os grupos dos condomínios'),
  ])

  // Só vínculos destas cobranças podem alterar o bloqueio de captação deste refresh.
  const chargeIds = [...new Set(charges.map(row => row.id).filter((id): id is string => Boolean(id)))]
  // Inclui acordos exibidos e acordos de parcelas do período: pagamento antigo efetiva acordo futuro.
  const agreementIds = collectTvRelevantAgreementIds(agreements, installments)
  async function pagesForIds<T>(ids: string[], queryName: string, label: string, buildQuery: (ids: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
    const rows: T[] = []
    const chunkSize = 200
    for (let index = 0; index < ids.length; index += chunkSize) {
      rows.push(...await pages((from, to) => buildQuery(ids.slice(index, index + chunkSize), from, to), queryName, label))
    }
    return rows
  }
  const [agreementLinks, paidReferences] = await Promise.all([
    pagesForIds<TvAgreementLink>(chargeIds, 'agreement_links', 'os vínculos dos acordos', (ids, from, to) => {
      let query = db.from('acordo_cobrancas')
        .select('acordo_id,cobranca_id,acordos!inner(status,carteira_id,condominio_id)')
        .in('acordos.status', TV_COLLECTION_AGREEMENT_STATUSES)
        .in('cobranca_id', ids)
      query = applyCarteiraIdsScope(query, scope.carteiraIds, 'acordos.carteira_id')
      return applySelection(query, 'acordos').order('acordo_id').order('cobranca_id').range(from, to)
    }),
    pagesForIds<{ acordo_id: string }>(agreementIds, 'paid_installments', 'os pagamentos que efetivam os acordos', (ids, from, to) => {
      let query = db.from('parcelas_acordo')
        .select('acordo_id,acordos!inner(carteira_id,condominio_id)')
        .eq('acordos.origem_controle', 'carteira')
        .in('status', TV_PAID_INSTALLMENT_STATUSES)
        .in('acordo_id', ids)
      query = applyCarteiraIdsScope(query, scope.carteiraIds, 'acordos.carteira_id')
      return applySelection(query, 'acordos').order('acordo_id').range(from, to)
    }),
  ])
  const availableCharges = prepareTvCollectionCharges(charges, judicialRows, agreements, agreementLinks)
  const paidAgreementIds = new Set(paidReferences.map(row => row.acordo_id))
  const withPayment = (agreement: TvAgreement): TvAgreement => ({ ...agreement, tem_parcela_paga: paidAgreementIds.has(agreement.id) })
  const qualifiedAgreements = agreements.filter(row => row.origem_controle === 'carteira').map(withPayment)
  const qualifiedInstallments = installments.map(row => ({
    ...row,
    acordos: Array.isArray(row.acordos) ? row.acordos.map(withPayment) : withPayment(row.acordos),
  }))
  const selected = (row: { carteira_id?: string | null; condominio_id?: string | null }) =>
    (!selection?.carteiraId || row.carteira_id === selection.carteiraId) && (!selection?.condominioId || row.condominio_id === selection.condominioId)
  const slides = buildTvSlides(start, end, today, wallets, availableCharges.filter(selected), qualifiedAgreements.filter(selected), qualifiedInstallments.filter(row => {
    const agreement = Array.isArray(row.acordos) ? row.acordos[0] : row.acordos
    return agreement && selected(agreement)
  }), condominiums)
  return { start, end, today, updatedAt: new Date().toISOString(), ...slides[0].metrics, slides }
}
