import { differenceInCalendarDays, format } from 'date-fns'
import type { ReguaEtapa, ReguaTom } from './types'
import { ajustarTom, fallbackTemplate, renderTemplate } from './templates'

function parseDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function diasDesdeVencimento(vencimento: string | null | undefined, hoje = new Date()) {
  const date = parseDate(vencimento)
  if (!date) return 0
  return Math.max(0, differenceInCalendarDays(hoje, date))
}

export function isCobrancaElegivelParaRegua(params: {
  vencimento: string | null | undefined
  inicioCobrancaDias?: number | null
  hoje?: Date
}) {
  const dias = diasDesdeVencimento(params.vencimento, params.hoje)
  const inicio = Number(params.inicioCobrancaDias ?? 30)
  return dias >= inicio
}

export function selecionarEtapa(params: {
  etapas: ReguaEtapa[]
  diasAtraso: number
  inicioCobrancaDias?: number | null
}) {
  const inicio = Number(params.inicioCobrancaDias ?? 0)
  const diasNaRegua = Math.max(0, params.diasAtraso - inicio)

  return [...params.etapas]
    .filter((etapa) => etapa.ativo !== false)
    .filter((etapa) => diasNaRegua >= Number(etapa.delay_dias ?? 0))
    .sort((a, b) => Number(b.delay_dias) - Number(a.delay_dias) || Number(b.ordem) - Number(a.ordem))[0]
}

export function montarMensagem(params: {
  tipo: 'cobranca' | 'acordo'
  etapa?: ReguaEtapa | null
  intensidade?: ReguaTom | null
  contexto: Record<string, string | number | null | undefined>
}) {
  const tom = params.intensidade ?? params.etapa?.tom ?? 'medio'
  const base = params.etapa?.template || fallbackTemplate(params.tipo, tom)
  return renderTemplate(ajustarTom(base, tom), params.contexto)
}

export function formatDateBR(value: string | null | undefined) {
  const date = parseDate(value)
  return date ? format(date, 'dd/MM/yyyy') : ''
}

export function formatMoneyBR(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0)
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numberValue)
}
