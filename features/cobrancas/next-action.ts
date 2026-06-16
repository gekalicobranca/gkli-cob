import { differenceInCalendarDays, parseISO } from 'date-fns'
import { COBRANCA_STATUS_OPERACIONAL } from '@/lib/constants/cobrancas'

export type CobrancaNextAction = {
  prioridade: 'critica' | 'alta' | 'media' | 'baixa'
  titulo: string
  descricao: string
  acao: string
  score: number
}

function diasDesde(date?: string | null) {
  if (!date) return null
  try {
    return differenceInCalendarDays(new Date(), parseISO(date))
  } catch {
    return null
  }
}

function prioridadeFromScore(score: number): CobrancaNextAction['prioridade'] {
  if (score >= 85) return 'critica'
  if (score >= 65) return 'alta'
  if (score >= 40) return 'media'
  return 'baixa'
}

export function calcularProximaAcaoCobranca(params: {
  statusOperacional?: string | null
  statusFinanceiro?: string | null
  vencimento?: string | null
  valorAtualizado?: number | null
  ultimaInteracaoAt?: string | null
  temAcordoVigente?: boolean
}): CobrancaNextAction {
  const status = params.statusOperacional ?? COBRANCA_STATUS_OPERACIONAL.NOVO
  const diasAtraso = Math.max(0, diasDesde(params.vencimento) ?? 0)
  const diasSemInteracao = diasDesde(params.ultimaInteracaoAt)
  const valor = Number(params.valorAtualizado ?? 0)

  let score = 10
  if (valor >= 20000) score += 35
  else if (valor >= 10000) score += 28
  else if (valor >= 5000) score += 22
  else if (valor >= 2000) score += 14

  if (diasAtraso >= 90) score += 30
  else if (diasAtraso >= 60) score += 24
  else if (diasAtraso >= 30) score += 18
  else if (diasAtraso >= 15) score += 10

  if (diasSemInteracao === null) score += 14
  else if (diasSemInteracao >= 10) score += 14
  else if (diasSemInteracao >= 5) score += 8

  let titulo = 'Acompanhar cobrança'
  let descricao = 'Cobrança em fluxo operacional. Revise histórico e mantenha cadência.'
  let acao = 'Registrar próxima interação'

  if (params.temAcordoVigente || status === COBRANCA_STATUS_OPERACIONAL.ACORDO_FIRMADO) {
    score += 6
    titulo = 'Acompanhar acordo vinculado'
    descricao = 'A cobrança já tem acordo associado. O foco agora é cumprimento e prevenção de atraso.'
    acao = 'Abrir acordo'
  } else if (status === COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO) {
    score += 28
    titulo = 'Fechar negociação'
    descricao = 'Negociação aberta tem maior chance de conversão. Priorize proposta objetiva.'
    acao = 'Agrupar cobranças ou registrar retorno'
  } else if (status === COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA) {
    score += 18
    titulo = 'Propor acordo'
    descricao = 'Cobrança ativa deve evoluir para proposta de acordo ou novo contato documentado.'
    acao = 'Propor acordo'
  } else if (status === COBRANCA_STATUS_OPERACIONAL.NOVO) {
    score += 10
    titulo = 'Iniciar cobrança'
    descricao = 'Cobrança nova precisa de primeiro movimento operacional.'
    acao = 'Registrar primeiro contato'
  } else if (status === COBRANCA_STATUS_OPERACIONAL.PRE_JURIDICO) {
    score = 30
    titulo = 'Preparar documentação jurídica'
    descricao = 'Cobrança saiu da cadência extrajudicial e está em preparação de documentação.'
    acao = 'Registrar andamento pré-jurídico'
  } else if (status === COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO) {
    score = 20
    titulo = 'Monitorar judicialização'
    descricao = 'Caso judicializado sai da cadência comum de cobrança extrajudicial.'
    acao = 'Registrar acompanhamento'
  } else if (status === COBRANCA_STATUS_OPERACIONAL.SUSPENSO) {
    score = 10
    titulo = 'Sem ação imediata'
    descricao = 'Cobrança suspensa não deve receber ação automática sem revisão.'
    acao = 'Revisar suspensão'
  }

  score = Math.max(0, Math.min(100, score))

  return {
    prioridade: prioridadeFromScore(score),
    titulo,
    descricao,
    acao,
    score,
  }
}

export function nextActionTone(prioridade: CobrancaNextAction['prioridade']) {
  if (prioridade === 'critica') return 'border-red-100 bg-red-50 text-red-950'
  if (prioridade === 'alta') return 'border-amber-100 bg-amber-50 text-amber-950'
  if (prioridade === 'media') return 'border-blue-100 bg-blue-50 text-blue-950'
  return 'border-slate-100 bg-slate-50 text-slate-900'
}
