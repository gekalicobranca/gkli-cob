import { LOTE_STATUS } from '@/lib/core/status'

export type ReguaContadores = {
  avaliadas: number
  criadas: number
  puladas: number
  duplicadas: number
  erros: number
}

export type ReguaLoteContext = {
  id: string
  carteiraId?: string
  contadores: ReguaContadores
}

export function novoContador(): ReguaContadores {
  return { avaliadas: 0, criadas: 0, puladas: 0, duplicadas: 0, erros: 0 }
}

export function cicloReferencia(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function normalizarEtapaId(etapaId?: string | null) {
  if (!etapaId) return null
  return etapaId.startsWith('default-') ? null : etapaId
}

export function criarReguaFingerprint(params: {
  contexto: 'regua_cobranca' | 'regua_acordo'
  entidadeId: string
  etapaId?: string | null
  canal: string
  ciclo: string
}) {
  return [
    params.contexto,
    params.entidadeId,
    params.etapaId ?? 'sem_etapa',
    params.canal,
    params.ciclo,
  ].join(':')
}

export function statusFinalDoLote(contadores: ReguaContadores, fallback = LOTE_STATUS.PENDENTE_APROVACAO) {
  return contadores.erros > 0 ? LOTE_STATUS.CONCLUIDO_COM_FALHAS : fallback
}

export function resumoContadores(contadores: ReguaContadores, extras: Record<string, unknown> = {}) {
  return {
    ...extras,
    total_avaliadas: contadores.avaliadas,
    total_criadas: contadores.criadas,
    total_puladas: contadores.puladas,
    total_duplicadas: contadores.duplicadas,
    total_erros: contadores.erros,
  }
}

export function incrementarContador(
  total: ReguaContadores,
  lote: ReguaContadores,
  key: keyof ReguaContadores,
) {
  total[key] += 1
  lote[key] += 1
}
