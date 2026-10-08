import { calcularDespesasAcordo } from '../acordos/calculo-despesas'
import { diasDesdeVencimento } from '../regua/engine'
import { getCobrancaStatusFinanceiro, getCobrancaStatusOperacional } from '../../lib/core/cobranca-status'
import { multaPorInfracao } from './natureza-cobranca'
import { formatarEmailAgente } from '../agentes-virtuais/perfis'

export const KEILA_CASO_TIPO = 'keila_atendimento'
export const KEILA_ESTADOS = {
  em_analise: 'Em análise',
  buscando_debitos: 'Buscando débitos',
  aguardando_administradora: 'Aguardando administradora',
  proposta_preparada: 'Proposta preparada',
  aguardando_retorno: 'Aguardando retorno',
  atendimento_humano: 'Em atendimento humano',
  concluido: 'Concluído',
} as const
export type KeilaEstado = keyof typeof KEILA_ESTADOS
export type KeilaEmail = { chave: string; nome: string; remetente: string; recebido_em: string; assunto: string; resumo: string }
export type KeilaAtividade = { em: string; descricao: string; usuario_id?: string | null }
export type KeilaCasoPayload = {
  versao: 1
  estado: KeilaEstado
  intencao: 'debitos' | 'parcelamento' | 'outro'
  unidade_ids: string[]
  emails: KeilaEmail[]
  atividades: KeilaAtividade[]
  proxima_acao: string
  execucao_id?: string | null
  resposta_simulada?: string | null
  acordos?: import('./acordos').KeilaAcordo[]
  acompanhamento?: import('./acompanhamento').KeilaAcompanhamento
  envio_permitido: false
  modo: 'supervisionado'
}

export function lerCasoPayload(value: unknown): KeilaCasoPayload | null {
  if (!value || typeof value !== 'object') return null
  const p = value as KeilaCasoPayload
  if (p.versao !== 1 || !Object.hasOwn(KEILA_ESTADOS, p.estado) ||
      !['debitos', 'parcelamento', 'outro'].includes(p.intencao) ||
      !Array.isArray(p.unidade_ids) || !Array.isArray(p.emails) || !Array.isArray(p.atividades)) return null
  return p
}

export function unirEmails(atuais: KeilaEmail[], novos: KeilaEmail[]) {
  const emails = new Map(atuais.map(email => [email.chave, email]))
  for (const email of novos) if (!emails.has(email.chave)) emails.set(email.chave, email)
  return [...emails.values()].sort((a, b) => a.recebido_em.localeCompare(b.recebido_em))
}

export function formatarEmailKeila(nome: string, texto: string, agora = new Date()) {
  return formatarEmailAgente('keila', nome, texto, agora)
}

type CobrancaProposta = {
  id: string; vencimento?: string | null; valor_atualizado?: number | string | null
  status?: string | null; status_operacional?: string | null; status_financeiro?: string | null
  duplicada_de_id?: string | null
  observacoes?: string | null; historico?: string | null; descricao?: string | null
}

/** Usa o cálculo financeiro existente; nunca inclui cotas ainda fora da régua. */
export function simularPropostaKeila(cobrancas: CobrancaProposta[], inicioReguaDias: number, hoje = new Date()) {
  if (!Number.isFinite(inicioReguaDias) || inicioReguaDias < 0) throw new Error('Início da régua inválido.')
  const excluidas: string[] = []
  const hojeCivil = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(hoje)
  const referenciaLocal = new Date(`${hojeCivil}T12:00:00`)
  const vistas = new Set<string>()
  const itens = cobrancas.filter(c => {
    const valor = Number(c.valor_atualizado)
    const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(c.vencimento ?? '') &&
      Number.isFinite(Date.parse(`${c.vencimento}T00:00:00Z`)) && new Date(`${c.vencimento}T00:00:00Z`).toISOString().slice(0, 10) === c.vencimento
    const atraso = dataValida && c.vencimento! <= hojeCivil ? diasDesdeVencimento(c.vencimento, referenciaLocal) : NaN
    const elegivel = !multaPorInfracao(c) && !vistas.has(c.id) && !c.duplicada_de_id && Number.isFinite(atraso) && atraso >= inicioReguaDias &&
      getCobrancaStatusFinanceiro(c) === 'em_aberto' &&
      ['novo', 'em_cobranca_ativa', 'em_negociacao', 'possivel_acordo'].includes(getCobrancaStatusOperacional(c)) &&
      Number.isFinite(valor) && valor > 0
    vistas.add(c.id)
    if (!elegivel) excluidas.push(c.id)
    return elegivel
  }).map(c => ({ id: c.id, valor: Number(c.valor_atualizado) }))
  if (!itens.length) return null
  const avista = calcularDespesasAcordo(itens, [], 10, 0, { quantidadeParcelas: 1, entrada: 0 })
  const parcelado = calcularDespesasAcordo(itens, [], 20, 0, { quantidadeParcelas: 3, entrada: 0 })
  const centavos = Math.round(parcelado.total * 100)
  const parcelas = [0, 1, 2].map(i => (Math.floor(centavos / 3) + (i < centavos % 3 ? 1 : 0)) / 100)
  return { base: avista.baseDespesa, avista, parcelado, parcelas, cobrancaIds: itens.map(i => i.id), excluidas }
}
