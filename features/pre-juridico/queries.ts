import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

const STATUS_ELEGIVEIS = new Set(['novo', 'em_cobranca_ativa', 'em_negociacao', 'possivel_acordo'])
const STATUS_VISIVEIS = [...STATUS_ELEGIVEIS, 'pre_juridico']

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
  let query = supabase
    .from('cobrancas')
    .select(`
      id, carteira_id, condominio_id, unidade_id, competencia, vencimento,
      valor_original, valor_atualizado, status, status_operacional, status_financeiro,
      carteira:carteiras(nome,pre_juridico_habilitado),
      condominio:condominios(nome,nome_operacional,administradora,inicio_cobranca_dias,dias_cobranca_ativa,pre_juridico_habilitado),
      unidade:unidades(identificacao,bloco,responsavel_nome)
    `)
    .in('status_operacional', STATUS_VISIVEIS)
    .order('vencimento', { ascending: true })
    .limit(5000)

  query = applyCarteiraScope(query, scope.carteiraIds)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar cobranças do pré-jurídico: ${error.message}`)

  const cobrancaIds = (data ?? []).map((row: any) => row.id).filter(Boolean)
  const cobrancasEmAcordo = new Set<string>()
  for (let index = 0; index < cobrancaIds.length; index += 200) {
    const chunk = cobrancaIds.slice(index, index + 200)
    const [vinculosResult, acordosResult] = await Promise.all([
      supabase.from('acordo_cobrancas').select('cobranca_id').in('cobranca_id', chunk),
      (() => {
        let acordosQuery = supabase.from('acordos').select('cobranca_id').in('cobranca_id', chunk)
        acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds)
        return acordosQuery
      })(),
    ])
    if (vinculosResult.error && vinculosResult.error.code !== '42P01') throw new Error(`Erro ao conferir cobranças vinculadas a acordos: ${vinculosResult.error.message}`)
    if (acordosResult.error) throw new Error(`Erro ao conferir cobranças principais dos acordos: ${acordosResult.error.message}`)
    for (const row of (vinculosResult.data ?? []) as any[]) if (row.cobranca_id) cobrancasEmAcordo.add(row.cobranca_id)
    for (const row of (acordosResult.data ?? []) as any[]) if (row.cobranca_id) cobrancasEmAcordo.add(row.cobranca_id)
  }

  const today = todaySaoPaulo()
  const resultado = (data ?? []).flatMap((row: any) => {
    const carteira = Array.isArray(row.carteira) ? row.carteira[0] : row.carteira
    const condominio = Array.isArray(row.condominio) ? row.condominio[0] : row.condominio
    const unidade = Array.isArray(row.unidade) ? row.unidade[0] : row.unidade
    const operational = String(row.status_operacional ?? row.status ?? '').trim().toLowerCase()
    const financial = String(row.status_financeiro ?? '').trim().toLowerCase()
    const due = dateOnly(row.vencimento)
    const prazoAtivo = Number(condominio?.dias_cobranca_ativa ?? 60)
    const prazoTotal = Number(condominio?.inicio_cobranca_dias ?? 0) + prazoAtivo
    const diasAtraso = due ? daysBetween(due, today) : 0
    const encaminhado = operational === 'pre_juridico'
    const elegivel = Boolean(
      carteira?.pre_juridico_habilitado &&
      condominio?.pre_juridico_habilitado &&
      due &&
      diasAtraso >= prazoTotal &&
      STATUS_ELEGIVEIS.has(operational) &&
      !cobrancasEmAcordo.has(row.id) &&
      !['quitado', 'cancelado'].includes(financial),
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

  const unidadeIds = Array.from(new Set(resultado.map((row: any) => row.unidade_id).filter(Boolean)))
  if (!unidadeIds.length) return resultado
  let todasQuery = supabase.from('cobrancas').select('unidade_id,valor_original,valor_atualizado').in('unidade_id', unidadeIds)
  todasQuery = applyCarteiraScope(todasQuery, scope.carteiraIds)
  const { data: todas, error: todasError } = await todasQuery
  if (todasError) throw new Error(`Erro ao totalizar cobranças por unidade: ${todasError.message}`)
  const totais = new Map<string, { quantidade: number; valor: number }>()
  for (const row of (todas ?? []) as any[]) {
    const current = totais.get(row.unidade_id) ?? { quantidade: 0, valor: 0 }
    current.quantidade += 1
    current.valor += Number(row.valor_atualizado ?? row.valor_original ?? 0)
    totais.set(row.unidade_id, current)
  }
  return resultado.map((row: any) => ({
    ...row,
    quantidade_cobrancas_unidade: totais.get(row.unidade_id)?.quantidade ?? 1,
    valor_cobrancas_unidade: totais.get(row.unidade_id)?.valor ?? Number(row.valor_atualizado ?? row.valor_original ?? 0),
  }))
}

export async function listCobrancasAgrupadasPreJuridico(scope: CarteiraScope, ids: string[]) {
  if (!ids.length) return []
  const supabase = createAdminClient()
  let query = supabase
    .from('cobrancas')
    .select(`
      id, carteira_id, condominio_id, unidade_id, competencia, vencimento,
      valor_original, valor_atualizado, status, status_operacional, status_financeiro,
      carteira:carteiras(nome),
      condominio:condominios(nome,nome_operacional,administradora),
      unidade:unidades(identificacao,bloco,responsavel_nome)
    `)
    .in('id', ids)
    .order('vencimento', { ascending: true })
  query = applyCarteiraScope(query, scope.carteiraIds)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar cobranças agrupadas no laudo: ${error.message}`)
  return (data ?? []).map((row: any) => ({
    ...row,
    carteira: Array.isArray(row.carteira) ? row.carteira[0] : row.carteira,
    condominio: Array.isArray(row.condominio) ? row.condominio[0] : row.condominio,
    unidade: Array.isArray(row.unidade) ? row.unidade[0] : row.unidade,
  }))
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
      procuracao_lote_id, procuracao_lote_criado_em,
      distribuicao_status, distribuicao_solicitada_em, distribuido_em,
      numero_processo, tribunal, foro, observacoes, enviado_juridico_em,
      judicializado_em, created_at, updated_at,
      carteira:carteiras(nome),
      condominio:condominios(nome,nome_operacional,administradora),
      unidade:unidades(identificacao,bloco,responsavel_nome),
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

  let cobrancasQuery = supabase
    .from('cobrancas')
    .select('id,unidade_id,valor_original,valor_atualizado,vencimento,status,status_financeiro,status_operacional')
    .in('unidade_id', unidadeIds)
  cobrancasQuery = applyCarteiraScope(cobrancasQuery, scope.carteiraIds)
  const { data: cobrancas, error: cobrancasError } = await cobrancasQuery
  if (cobrancasError) throw new Error(`Erro ao carregar cobranças agrupadas dos casos: ${cobrancasError.message}`)
  const porUnidade = new Map<string, any[]>()
  for (const cobranca of (cobrancas ?? []) as any[]) {
    const current = porUnidade.get(cobranca.unidade_id) ?? []
    current.push(cobranca)
    porUnidade.set(cobranca.unidade_id, current)
  }
  return rows.map((row) => ({ ...row, cobrancas_unidade: porUnidade.get(row.unidade_id) ?? [] }))
}
