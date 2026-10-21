'use server'

import { createClient } from '@/utils/supabase/server'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { applyCarteiraIdsScope } from '@/utils/auth/carteira-scope'
import { somenteCobrancasCanonicas } from '@/lib/core/cobranca-arquivamento'
import { type TvCharge, type TvAgreement, type TvInstallment } from './tv-metrics'
import { buildTvSlides } from './tv-slides'
import { prepareTvCollectionCharges, TV_COLLECTION_AGREEMENT_STATUSES, type TvAgreementLink } from './tv-collection'
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

export async function getTvResults(start: string, end: string) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  if (!valid(start) || !valid(end) || start > end || Date.parse(end) - Date.parse(start) >= 366 * 86400000) throw new Error('Selecione um período válido de até 366 dias.')
  const scope = await getPermittedCarteiras()
  const db = await createClient()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const nextDay = new Date(Date.parse(end) + 86400000).toISOString().slice(0, 10)
  const agreementFields = 'id,cobranca_id,carteira_id,condominio_id,data_acordo,valor_acordado,observacoes,status,status_financeiro,fluxo_status,boletos_solicitados_em,despesa_cobranca_valor,despesa_cobranca_percentual'
  async function pages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, label: string) {
    const rows: T[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await fetchPage(offset, offset + 999)
      if (error || !data) throw new Error(`Não foi possível consultar ${label}.`)
      rows.push(...data)
      if (data.length < 1000) return rows
    }
  }
  const [charges, agreements, installments, wallets, judicialRows, agreementLinks, condominiums, paidReferences] = await Promise.all([
    pages<TvCharge>((from, to) => applyCarteiraIdsScope(somenteCobrancasCanonicas(db.from('cobrancas')
      .select('id,carteira_id,condominio_id,unidade_id,valor_atualizado,vencimento,status,status_operacional,status_financeiro,unidades(acao_judicial)'))
      .lte('vencimento', today < end ? today : end)
      .or('status_operacional.in.(novo,em_cobranca_ativa,em_negociacao,possivel_acordo),status_operacional.is.null'), scope.carteiraIds).order('id').range(from, to), 'a captação'),
    pages<TvAgreement>((from, to) => applyCarteiraIdsScope(db.from('acordos').select(agreementFields)
      .or(`and(data_acordo.gte.${start},data_acordo.lt.${nextDay}),data_acordo.eq.${today},status.in.(${TV_COLLECTION_AGREEMENT_STATUSES.join(',')})`), scope.carteiraIds)
      .order('id').range(from, to), 'os acordos'),
    pages<TvInstallment>((from, to) => applyCarteiraIdsScope(db.from('parcelas_acordo')
      .select(`id,valor,vencimento,status,data_pagamento,valor_repasse_informado,acordos!inner(${agreementFields})`)
      .or(`and(vencimento.gte.${start},vencimento.lt.${nextDay}),and(data_pagamento.gte.${start},data_pagamento.lt.${nextDay})`), scope.carteiraIds, 'acordos.carteira_id')
      .order('id').range(from, to), 'as parcelas'),
    pages<{ id: string; nome: string }>((from, to) => applyCarteiraIdsScope(db.from('carteiras').select('id,nome'), scope.carteiraIds, 'id')
      .order('id').range(from, to), 'as carteiras'),
    pages<{ unidade_id: string | null }>((from, to) => applyCarteiraIdsScope(somenteCobrancasCanonicas(db.from('cobrancas')
      .select('id,unidade_id'))
      .or('status_operacional.in.(pre_distribuicao,pre_juridico,judicializado),status.in.(pre_distribuicao,pre_juridico,judicializado)'), scope.carteiraIds)
      .order('id').range(from, to), 'os bloqueios jurídicos'),
    pages<TvAgreementLink>((from, to) => applyCarteiraIdsScope(db.from('acordo_cobrancas')
      .select('acordo_id,cobranca_id,acordos!inner(status,carteira_id)')
      .in('acordos.status', TV_COLLECTION_AGREEMENT_STATUSES), scope.carteiraIds, 'acordos.carteira_id')
      .order('acordo_id').order('cobranca_id').range(from, to), 'os vínculos dos acordos'),
    pages<{ id: string; grupo: string | null }>((from, to) => applyCarteiraIdsScope(db.from('condominios')
      .select('id,grupo'), scope.carteiraIds).order('id').range(from, to), 'os grupos dos condomínios'),
    pages<{ acordo_id: string }>((from, to) => applyCarteiraIdsScope(db.from('parcelas_acordo')
      .select('id,acordo_id,acordos!inner(carteira_id)')
      .in('status', TV_PAID_INSTALLMENT_STATUSES), scope.carteiraIds, 'acordos.carteira_id')
      .order('id').range(from, to), 'os pagamentos que efetivam os acordos'),
  ])
  const availableCharges = prepareTvCollectionCharges(charges, judicialRows, agreements, agreementLinks)
  const paidAgreementIds = new Set(paidReferences.map(row => row.acordo_id))
  const withPayment = (agreement: TvAgreement): TvAgreement => ({ ...agreement, tem_parcela_paga: paidAgreementIds.has(agreement.id) })
  const qualifiedAgreements = agreements.map(withPayment)
  const qualifiedInstallments = installments.map(row => ({
    ...row,
    acordos: Array.isArray(row.acordos) ? row.acordos.map(withPayment) : withPayment(row.acordos),
  }))
  const slides = buildTvSlides(start, end, today, wallets, availableCharges, qualifiedAgreements, qualifiedInstallments, condominiums)
  return { start, end, today, updatedAt: new Date().toISOString(), ...slides[0].metrics, slides }
}
