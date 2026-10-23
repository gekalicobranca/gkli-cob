import { dividirCriacaoFlows } from './dividir-criacao'
import { priorizarWhatsappSemEmail } from './prioridade-whatsapp'

type Cobranca = { id: string; unidade_id?: string | null; condominio_id: string; carteira_id: string; whatsapp_sem_email?: boolean }

export function planejarFlowsSequenciais<T extends Cobranca>(rows: T[], reguas: Record<string, string>, canal?: string) {
  const grupos = new Map<string, T[]>()
  const vistos = new Set<string>()
  for (const row of priorizarWhatsappSemEmail(rows, canal)) {
    if (vistos.has(row.id)) continue
    vistos.add(row.id)
    if (!row.condominio_id || !row.carteira_id || !reguas[row.condominio_id]) throw new Error('Selecione uma régua para cada condomínio.')
    const key = `${row.carteira_id}:${row.condominio_id}`
    const grupo = grupos.get(key) ?? []
    grupo.push(row)
    grupos.set(key, grupo)
  }
  return [...grupos.values()].flatMap(grupo => dividirCriacaoFlows(grupo).map(cobrancas => ({
    cobrancas,
    carteiraId: grupo[0].carteira_id,
    condominioId: grupo[0].condominio_id,
    reguaId: reguas[grupo[0].condominio_id],
  })))
}
