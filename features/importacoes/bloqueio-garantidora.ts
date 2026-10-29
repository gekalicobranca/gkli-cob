import { COBRANCA_STATUS_OPERACIONAL } from '@/lib/constants/cobrancas'

export type ConfiguracaoBloqueioGarantidora = {
  bloqueio_garantidora_habilitado?: boolean | null
  bloqueio_garantidora_inicio?: string | null
  bloqueio_garantidora_fim?: string | null
}

export function normalizarDataBloqueio(value: unknown) {
  const text = String(value ?? '').trim()
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : text
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const data = new Date(`${iso}T00:00:00.000Z`)
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === iso ? iso : null
}

export function avaliarBloqueioGarantidora(
  configuracao: ConfiguracaoBloqueioGarantidora | null | undefined,
  cobranca: { competencia?: unknown; vencimento?: unknown },
) {
  if (!configuracao?.bloqueio_garantidora_habilitado) return { bloqueada: false, competencia: null as number | null }

  const inicio = normalizarDataBloqueio(configuracao.bloqueio_garantidora_inicio)
  const fim = normalizarDataBloqueio(configuracao.bloqueio_garantidora_fim)
  const vencimento = normalizarDataBloqueio(cobranca.vencimento)
  if (!inicio || !fim || inicio > fim) throw new Error('Período do Bloqueio Garantidora inválido. Informe datas completas.')
  if (!vencimento) throw new Error('Vencimento inválido para conferir o Bloqueio Garantidora. A competência mensal não substitui a data.')
  const competencia = Number(vencimento.slice(0, 7).replace('-', ''))
  const bloqueada = vencimento >= inicio && vencimento <= fim
  return { bloqueada, competencia }
}

export function statusComBloqueioGarantidora(statusAtual: string, bloqueada: boolean) {
  return bloqueada ? COBRANCA_STATUS_OPERACIONAL.SUSPENSO : statusAtual
}

export function observacaoComBloqueioGarantidora(observacoes: unknown, bloqueada: boolean) {
  const atual = String(observacoes ?? '').trim()
  if (!bloqueada) return atual || null
  const marcador = 'Suspensa automaticamente: vencimento abrangido pelo Bloqueio Garantidora.'
  return atual ? `${atual} | ${marcador}` : marcador
}
