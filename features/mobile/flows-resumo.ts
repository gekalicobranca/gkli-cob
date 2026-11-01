import { canaisDaRegua } from '@/features/flows/cobranca/canais'

type Charge = { id: string; valor_atualizado?: number | string | null; valor_original?: number | string | null }
export type FlowLink = { id: string; cobranca_id: string; created_at: string; flow: any }
const relation = (value: any) => Array.isArray(value) ? value[0] : value
const labels: Record<string, string> = { sem_flow: 'Sem flow cadastrado', pronto: 'Pronto para envio', em_execucao: 'Em execução', pausado: 'Pausado', concluido: 'Concluído', concluido_com_falhas: 'Concluído com falhas', cancelado: 'Cancelado', conferir: 'A conferir' }
export function resumirFlowMobile(rows: Charge[], links: FlowLink[]) {
  const selected = new Map<string, { stamp: string; status: string }>()
  const allowed = new Set(rows.map(row => row.id))
  for (const link of links) {
    if (!allowed.has(link.cobranca_id)) continue
    const flow = relation(link.flow)
    if (!flow) continue
    const canais = Array.isArray(flow.canais) && flow.canais.length ? flow.canais : canaisDaRegua(relation(flow.regua) ?? {})
    for (const canal of ['email', 'whatsapp']) {
      if (canais.length && !canais.includes(canal)) continue
      const key = `${link.cobranca_id}:${canal}`, previous = selected.get(key)
      const stamp = `${link.created_at}:${link.id}`
      if (!previous || stamp > previous.stamp) selected.set(key, { stamp, status: !canais.length || !labels[flow.status] ? 'conferir' : flow.status })
    }
  }
  const summarize = (canal: string) => {
    const groups = new Map<string, { status: string; label: string; quantidade: number; centavos: number }>()
    for (const row of new Map(rows.map(row => [row.id, row])).values()) {
      const status = selected.get(`${row.id}:${canal}`)?.status ?? 'sem_flow'
      const group = groups.get(status) ?? { status, label: labels[status], quantidade: 0, centavos: 0 }
      group.quantidade++
      const value = Number(row.valor_atualizado ?? row.valor_original ?? 0)
      group.centavos += Number.isFinite(value) ? Math.round(value * 100) : 0
      groups.set(status, group)
    }
    return [...groups.values()].map(({centavos, ...g}) => ({...g, valor: centavos / 100}))
  }
  return { email: summarize('email'), whatsapp: summarize('whatsapp') }
}
