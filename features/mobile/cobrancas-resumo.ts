import { getCobrancaStatusOperacional, getCobrancaStatusFinanceiro } from '@/lib/core/cobranca-status'
import { COBRANCA_STATUS_LABEL } from '@/lib/constants/cobrancas'
import { cobrancaArquivada } from '@/lib/core/cobranca-arquivamento'

type Charge = { id: string; status?: string | null; status_operacional?: string | null; status_financeiro?: string | null; valor_atualizado?: number | string | null; valor_original?: number | string | null; duplicada_de_id?: string | null }
export function resumoCobrancasMobile(rows: Charge[]) {
  const groups = new Map<string, { status: string; label: string; quantidade: number; centavos: number }>()
  const seen = new Set<string>()
  for (const row of rows) {
    if (cobrancaArquivada(row) || seen.has(row.id)) continue
    seen.add(row.id)
    const legacy = String(row.status ?? '').toLowerCase()
    const status = ['cancelado', 'cancelada'].includes(legacy) ? 'cancelado'
      : getCobrancaStatusFinanceiro(row) === 'quitado' || ['pago', 'paga', 'quitado', 'quitada'].includes(legacy) ? 'quitado' : getCobrancaStatusOperacional(row)
    const group = groups.get(status) ?? { status, label: status === 'cancelado' ? 'Cancelado' : COBRANCA_STATUS_LABEL[status] ?? status.replaceAll('_', ' '), quantidade: 0, centavos: 0 }
    const valor = Number(row.valor_atualizado ?? row.valor_original ?? 0)
    group.quantidade++
    group.centavos += Number.isFinite(valor) ? Math.round(valor * 100) : 0
    groups.set(status, group)
  }
  return { total: seen.size, valor: [...groups.values()].reduce((s, g) => s + g.centavos, 0) / 100,
    porStatus: [...groups.values()].sort((a, b) => b.centavos - a.centavos || a.label.localeCompare(b.label, 'pt-BR')).map(({centavos, ...g}) => ({...g, valor: centavos / 100})) }
}
