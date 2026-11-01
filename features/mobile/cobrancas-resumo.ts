import { getCobrancaStatusOperacional, getCobrancaStatusFinanceiro } from '@/lib/core/cobranca-status'
import { cobrancaArquivada } from '@/lib/core/cobranca-arquivamento'

type Charge = { id: string; status?: string | null; status_operacional?: string | null; status_financeiro?: string | null; valor_atualizado?: number | string | null; valor_original?: number | string | null; duplicada_de_id?: string | null }
export function grupoCobrancaMobile(row: Charge) {
  if (cobrancaArquivada(row)) return null
  const legacy = String(row.status ?? '').toLowerCase()
  if (['pago', 'paga', 'quitado', 'quitada', 'cancelado', 'cancelada'].includes(legacy) || ['quitado', 'renegociado'].includes(getCobrancaStatusFinanceiro(row))) return null
  const operational = getCobrancaStatusOperacional(row)
  return operational === 'novo' ? 'novas' : ['em_cobranca_ativa', 'em_negociacao', 'possivel_acordo'].includes(operational) ? 'ativas' : null
}
export function resumoCobrancasMobile(rows: Charge[]) {
  const groups = new Map([['ativas', { status: 'ativas', label: 'Ativas', quantidade: 0, centavos: 0 }], ['novas', { status: 'novas', label: 'Novas', quantidade: 0, centavos: 0 }]])
  const seen = new Set<string>()
  for (const row of rows) {
    if (cobrancaArquivada(row) || seen.has(row.id)) continue
    const status = grupoCobrancaMobile(row)
    if (!status) continue
    seen.add(row.id)
    const group = groups.get(status)!
    const valor = Number(row.valor_atualizado ?? row.valor_original ?? 0)
    group.quantidade++
    group.centavos += Number.isFinite(valor) ? Math.round(valor * 100) : 0
    groups.set(status, group)
  }
  return { total: seen.size, valor: [...groups.values()].reduce((s, g) => s + g.centavos, 0) / 100,
    porStatus: [...groups.values()].map(({centavos, ...g}) => ({...g, valor: centavos / 100})) }
}
