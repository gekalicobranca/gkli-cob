import type { KeilaCasoPayload } from './casos'

export const TIPOS_PENDENCIA = {
  debitos: 'Débitos atualizados', aprovacao: 'Aprovação do condomínio',
  boletos: 'Cadastro do acordo e boletos', proposta: 'Resposta à proposta',
} as const
export type VinculoOutlook = {
  conta: string; conversation_id: string; message_id: string; internet_message_id?: string
  acordo_id?: string; interlocutor: string
}
export type PendenciaKeila = {
  id: string; tipo: keyof typeof TIPOS_PENDENCIA; aguardando: string; criada_em: string
  prazo: string; intervalo_dias: number; proxima_acao: string; acordo_id?: string
  resolvida_em?: string; evidencia?: string; simulacoes: { em: string; texto: string }[]
}
export type KeilaAcompanhamento = { conversas: VinculoOutlook[]; pendencias: PendenciaKeila[] }
export function acompanhamento(payload: KeilaCasoPayload): KeilaAcompanhamento {
  return payload.acompanhamento ?? { conversas: [], pendencias: [] }
}
export function validarPrazo(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Prazo inválido.')
  return value
}
export function avancarPrazo(prazo: string, intervalo: number, hoje: string) {
  validarPrazo(prazo); validarPrazo(hoje)
  if (!Number.isInteger(intervalo) || intervalo < 1 || intervalo > 365) throw new Error('Intervalo inválido.')
  const data = new Date(`${prazo > hoje ? prazo : hoje}T12:00:00Z`)
  data.setUTCDate(data.getUTCDate() + intervalo)
  return data.toISOString().slice(0, 10)
}
export function cobrancaSimulada(payload: KeilaCasoPayload, pendencia: PendenciaKeila, hoje: string) {
  if (['atendimento_humano', 'concluido'].includes(payload.estado)) throw new Error('Acompanhamento automático suspenso neste caso.')
  if (pendencia.resolvida_em) throw new Error('Pendência já resolvida.')
  if (pendencia.prazo > validarPrazo(hoje)) throw new Error('O prazo de acompanhamento ainda não chegou.')
  return `Gostaria de acompanhar o retorno sobre ${TIPOS_PENDENCIA[pendencia.tipo].toLowerCase()}. ${pendencia.proxima_acao}`
}
/** A conta faz parte da chave: IDs de conversas não devem cruzar caixas postais. */
export function correspondeConversa(a: VinculoOutlook, b: VinculoOutlook) {
  return a.conta.toLowerCase() === b.conta.toLowerCase() && a.conversation_id === b.conversation_id
}
