import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

const STATUS_ELEGIVEIS = new Set(['novo', 'em_cobranca_ativa', 'em_negociacao', 'possivel_acordo'])

function dateOnly(value: unknown) {
  const normalized = String(value ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null
  const [year, month, day] = normalized.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}

export async function listPreJuridicoCobrancas(scope: CarteiraScope) {
  const supabase = await createClient()
  let query = supabase
    .from('cobrancas')
    .select(`
      id, carteira_id, condominio_id, unidade_id, competencia, vencimento,
      valor_original, valor_atualizado, status, status_operacional, status_financeiro,
      carteira:carteiras(nome,pre_juridico_habilitado),
      condominio:condominios(nome,nome_operacional,administradora,inicio_cobranca_dias,dias_expiracao_regua_pre_juridico),
      unidade:unidades(identificacao,bloco,responsavel_nome)
    `)
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

  const today = dateOnly(new Date().toISOString())!
  return (data ?? []).flatMap((row: any) => {
    const carteira = Array.isArray(row.carteira) ? row.carteira[0] : row.carteira
    const condominio = Array.isArray(row.condominio) ? row.condominio[0] : row.condominio
    const unidade = Array.isArray(row.unidade) ? row.unidade[0] : row.unidade
    const operational = String(row.status_operacional ?? row.status ?? '').trim().toLowerCase()
    const financial = String(row.status_financeiro ?? '').trim().toLowerCase()
    const due = dateOnly(row.vencimento)
    const prazoExtra = condominio?.dias_expiracao_regua_pre_juridico
    const prazoConfigurado = prazoExtra !== null && prazoExtra !== undefined
    const prazoTotal = Number(condominio?.inicio_cobranca_dias ?? 0) + Number(prazoExtra ?? 0)
    const diasAtraso = due ? daysBetween(due, today) : 0
    const encaminhado = operational === 'pre_juridico'
    const elegivel = Boolean(
      carteira?.pre_juridico_habilitado &&
      prazoConfigurado &&
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
}

export async function listPreJuridicoCasos(scope: CarteiraScope) {
  const supabase = await createClient()
  let query = supabase
    .from('pre_juridico_casos')
    .select(`
      id, carteira_id, acordo_id, condominio_id, unidade_id, cobranca_id,
      responsavel_id, etapa, escritorio_juridico, prazo_etapa, protocolo_envio,
      numero_processo, tribunal, foro, observacoes, enviado_juridico_em,
      judicializado_em, created_at, updated_at,
      carteira:carteiras(nome),
      condominio:condominios(nome,nome_operacional,administradora),
      unidade:unidades(identificacao,bloco,responsavel_nome),
      acordo:acordos(valor_acordado,data_acordo,status,status_financeiro),
      responsavel:profiles(nome,email)
    `)
    .order('updated_at', { ascending: false })
    .limit(500)
  query = applyCarteiraScope(query, scope.carteiraIds)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar monitor pré-jurídico: ${error.message}`)
  return data ?? []
}
