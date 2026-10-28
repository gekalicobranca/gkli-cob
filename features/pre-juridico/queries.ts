import { acordoBloqueiaPre, cobrancaAbertaPre, unidadeBloqueiaPre, totalizarRecortePre } from './eligibilidade'
import { somenteCobrancasCanonicas } from '../../lib/core/cobranca-arquivamento'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

const STATUS_ELEGIVEIS = new Set(['novo', 'em_cobranca_ativa', 'em_negociacao', 'possivel_acordo'])
const STATUS_VISIVEIS = [...STATUS_ELEGIVEIS, 'pre_distribuicao', 'pre_juridico']

function dateOnly(value: unknown) {
  const normalized = String(value ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null
  const [year, month, day] = normalized.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}

function todaySaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return dateOnly(`${values.year}-${values.month}-${values.day}`)!
}

export async function listPreJuridicoCobrancas(scope: CarteiraScope) {
  // A fila é calculada no servidor. O escopo do usuário continua sendo
  // aplicado explicitamente por carteira, sem depender do estado da sessão RLS.
  const supabase = createAdminClient()
  let query = somenteCobrancasCanonicas(supabase
    .from('cobrancas')
    .select(`
      id, carteira_id, condominio_id, unidade_id, competencia, vencimento,
      valor_original, valor_atualizado, status, status_operacional, status_financeiro, data_pagamento,
      carteira:carteiras(nome,pre_juridico_habilitado),
      condominio:condominios(nome,nome_operacional,administradora,inicio_cobranca_dias,dias_cobranca_ativa,pre_juridico_habilitado),
      unidade:unidades(identificacao,bloco,responsavel_nome,acao_judicial,numero_processo,conducao_processo)
    `))
    .in('status_operacional', STATUS_VISIVEIS)
    .order('vencimento', { ascending: true }).order('id')

  query = applyCarteiraScope(query, scope.carteiraIds)
  const data: any[] = []
  for (let offset = 0; ; offset += 500) {
    const { data: page, error } = await query.range(offset, offset + 499)
    if (error) throw new Error(`Erro ao carregar cobranças do pré-jurídico: ${error.message}`)
    data.push(...(page ?? []))
    if ((page ?? []).length < 500) break
  }

  const cobrancaIds = (data ?? []).map((row: any) => row.id).filter(Boolean)
  const cobrancasEmAcordo = new Set<string>()
  for (let index = 0; index < cobrancaIds.length; index += 200) {
    const chunk = cobrancaIds.slice(index, index + 200)
    const [vinculosResult, acordosResult] = await Promise.all([
      supabase.from('acordo_cobrancas').select('cobranca_id,acordo:acordos!inner(status,carteira_id)').in('cobranca_id', chunk),
      (() => {
        let acordosQuery = supabase.from('acordos').select('cobranca_id,status').in('cobranca_id', chunk)
        acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds)
        return acordosQuery
      })(),
    ])
    if (vinculosResult.error) throw new Error(`Erro ao conferir cobranças vinculadas a acordos: ${vinculosResult.error.message}`)
    if (acordosResult.error) throw new Error(`Erro ao conferir cobranças principais dos acordos: ${acordosResult.error.message}`)
    for (const row of (vinculosResult.data ?? []) as any[]) {
      const acordo = Array.isArray(row.acordo) ? row.acordo[0] : row.acordo
      if (row.cobranca_id && acordoBloqueiaPre(acordo?.status)) cobrancasEmAcordo.add(row.cobranca_id)
    }
    for (const row of (acordosResult.data ?? []) as any[]) if (row.cobranca_id && acordoBloqueiaPre(row.status)) cobrancasEmAcordo.add(row.cobranca_id)
  }

  const today = todaySaoPaulo()
  const resultado = (data ?? []).flatMap((row: any) => {
    const carteira = Array.isArray(row.carteira) ? row.carteira[0] : row.carteira
    const condominio = Array.isArray(row.condominio) ? row.condominio[0] : row.condominio
    const unidade = Array.isArray(row.unidade) ? row.unidade[0] : row.unidade
    const operational = String(row.status_operacional ?? row.status ?? '').trim().toLowerCase()
    if (!cobrancaAbertaPre(row) || unidadeBloqueiaPre(unidade) || cobrancasEmAcordo.has(row.id)) return []
    const due = dateOnly(row.vencimento)
    const prazoAtivo = Number(condominio?.dias_cobranca_ativa ?? 60)
    const prazoTotal = Number(condominio?.inicio_cobranca_dias ?? 0) + prazoAtivo
    const diasAtraso = due ? daysBetween(due, today) : 0
    const encaminhado = ['pre_distribuicao', 'pre_juridico'].includes(operational)
    const elegivel = Boolean(
      carteira?.pre_juridico_habilitado &&
      condominio?.pre_juridico_habilitado &&
      due &&
      diasAtraso >= prazoTotal &&
      STATUS_ELEGIVEIS.has(operational) &&
      !cobrancasEmAcordo.has(row.id),
    )

    if (!encaminhado && !elegivel) return []
    return [{
      ...row,
      carteira,
      condominio,
      unidade,
      dias_atraso: diasAtraso,
      prazo_total: prazoTotal,
      situacao_pre_juridico: encaminhado ? 'encaminhado' : 'elegivel',
    }]
  })

  return totalizarRecortePre(resultado)
}

export async function listCobrancasAgrupadasPreJuridico(scope: CarteiraScope, ids: string[]) {
  if (!ids.length) return []
  const permitidos = new Set(ids)
  return (await listPreJuridicoCobrancas(scope)).filter((row: any) => permitidos.has(row.id))
}

export async function listPreJuridicoCasos(scope: CarteiraScope) {
  const supabase = await createClient()
  let query = supabase
    .from('pre_juridico_casos')
    .select(`
      id, carteira_id, acordo_id, condominio_id, unidade_id, cobranca_id,
      responsavel_id, etapa, escritorio_juridico, prazo_etapa, protocolo_envio,
      certidao_status, certidao_solicitada_em, certidao_recebida_em,
      procuracao_status, procuracao_gerada_em, procuracao_assinada_em,
      procuracao_lote_id, procuracao_lote_criado_em, procuracao_flow_id,
      juridico_procuracao_assinada_confirmada, juridico_registro_recebido,
      juridico_laudo_enviado, distribuicao_status, distribuicao_solicitada_em,
      distribuido_em, distribuicao_cnj,
      numero_processo, tribunal, foro, observacoes, enviado_juridico_em,
      judicializado_em, created_at, updated_at,
      carteira:carteiras(nome),
      condominio:condominios(nome,nome_operacional,administradora),
      unidade:unidades(identificacao,bloco,responsavel_nome,acao_judicial,numero_processo,conducao_processo),
      acordo:acordos(valor_acordado,data_acordo,status,status_financeiro),
      cobranca:cobrancas(valor_original,valor_atualizado,vencimento,status_financeiro),
      responsavel:profiles(nome,email)
    `)
    .order('updated_at', { ascending: false })
    .limit(500)
  query = applyCarteiraScope(query, scope.carteiraIds)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar monitor pré-jurídico: ${error.message}`)
  const rows = (data ?? []) as any[]
  const unidadeIds = Array.from(new Set(rows.map((row) => row.unidade_id).filter(Boolean))) as string[]
  if (!unidadeIds.length) return rows

  const recorte = await listPreJuridicoCobrancas(scope)
  const cobrancas = recorte.filter((row: any) => unidadeIds.includes(row.unidade_id))
  const porUnidade = new Map<string, any[]>()
  for (const cobranca of (cobrancas ?? []) as any[]) {
    const current = porUnidade.get(cobranca.unidade_id) ?? []
    current.push(cobranca)
    porUnidade.set(cobranca.unidade_id, current)
  }
  return rows.map((row) => ({ ...row, cobrancas_unidade: porUnidade.get(row.unidade_id) ?? [] }))
}
