import { COBRANCA_STATUS_OPERACIONAL } from '@/lib/constants/cobrancas'

export type ConfiguracaoBloqueioGarantidora = {
  bloqueio_garantidora_habilitado?: boolean | null
  bloqueio_garantidora_inicio?: string | null
  bloqueio_garantidora_fim?: string | null
}

function mesReferencia(value: unknown) {
  const text = String(value ?? '').trim()
  let match = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (match) return Number(match[1]) * 100 + Number(match[2])

  match = text.match(/^(\d{2})\/(\d{4})$/)
  if (match) return Number(match[2]) * 100 + Number(match[1])

  match = text.match(/^\d{2}\/(\d{2})\/(\d{4})$/)
  if (match) return Number(match[2]) * 100 + Number(match[1])

  return null
}

export function avaliarBloqueioGarantidora(
  configuracao: ConfiguracaoBloqueioGarantidora | null | undefined,
  cobranca: { competencia?: unknown; vencimento?: unknown },
) {
  if (!configuracao?.bloqueio_garantidora_habilitado) return { bloqueada: false, competencia: null as number | null }

  const inicio = mesReferencia(configuracao.bloqueio_garantidora_inicio)
  const fim = mesReferencia(configuracao.bloqueio_garantidora_fim)
  const competencia = mesReferencia(cobranca.competencia) ?? mesReferencia(cobranca.vencimento)
  const bloqueada = inicio !== null && fim !== null && competencia !== null && competencia >= inicio && competencia <= fim
  return { bloqueada, competencia }
}

export function statusComBloqueioGarantidora(statusAtual: string, bloqueada: boolean) {
  return bloqueada ? COBRANCA_STATUS_OPERACIONAL.SUSPENSO : statusAtual
}

export function observacaoComBloqueioGarantidora(observacoes: unknown, bloqueada: boolean) {
  const atual = String(observacoes ?? '').trim()
  if (!bloqueada) return atual || null
  const marcador = 'Suspensa automaticamente: competência abrangida pelo Bloqueio Garantidora.'
  return atual ? `${atual} | ${marcador}` : marcador
}
