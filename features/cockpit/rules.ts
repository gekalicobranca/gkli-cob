import { differenceInCalendarDays, parseISO } from 'date-fns'

export type CockpitItem = {
  id: string
  tipo: 'acordo' | 'cobranca'
  origem: string
  titulo: string
  subtitulo: string
  status: string
  valor: number
  dataReferencia?: string | null
  ultimaInteracaoAt?: string | null
  href: string
  score: number
  prioridade: 'critica' | 'alta' | 'media' | 'baixa'
  acao: string
  motivo: string
}

function safeDaysFromToday(date?: string | null) {
  if (!date) return null

  try {
    const today = new Date()
    const parsed = parseISO(date)
    return differenceInCalendarDays(today, parsed)
  } catch {
    return null
  }
}

function moneyScore(value: number) {
  if (value >= 20000) return 35
  if (value >= 10000) return 28
  if (value >= 5000) return 22
  if (value >= 2000) return 15
  return 8
}

function interactionPenalty(ultimaInteracaoAt?: string | null) {
  const days = safeDaysFromToday(ultimaInteracaoAt)

  if (days === null) return 12
  if (days >= 10) return 14
  if (days >= 5) return 8
  if (days >= 3) return 4
  return 0
}

function prioridadeFromScore(score: number): CockpitItem['prioridade'] {
  if (score >= 85) return 'critica'
  if (score >= 65) return 'alta'
  if (score >= 40) return 'media'
  return 'baixa'
}

export function buildAcordoItem(acordo: any): CockpitItem {
  const valor = Number(acordo.valor_acordado ?? 0)
  const status = String(acordo.status ?? '')
  const vencimento = acordo.proxima_parcela_vencimento ?? acordo.data_acordo
  const days = safeDaysFromToday(vencimento)

  let score = moneyScore(valor)
  let acao = 'Acompanhar acordo'
  let motivo = 'Acordo ativo precisa de acompanhamento periódico.'

  if (status === 'em atraso') {
    score += 55
    acao = 'Cobrar parcela em atraso'
    motivo = 'Acordo em atraso é dinheiro em risco imediato.'
  } else if (status === 'rompido') {
    score += 48
    acao = 'Reativar cobrança'
    motivo = 'Acordo rompido deve voltar para reabordagem operacional.'
  } else if (status === 'ativo') {
    if (days !== null && days >= 0) {
      score += 45
      acao = 'Confirmar pagamento da parcela'
      motivo = 'Parcela já venceu ou vence hoje.'
    } else if (days !== null && days >= -3) {
      score += 34
      acao = 'Lembrar vencimento da parcela'
      motivo = 'Parcela próxima do vencimento reduz risco de atraso.'
    } else {
      score += 20
      acao = 'Monitorar cumprimento'
      motivo = 'Acordo ativo com parcela futura.'
    }
  } else if (status === 'quitado' || status === 'cancelado') {
    score -= 30
    acao = 'Sem ação imediata'
    motivo = 'Acordo encerrado.'
  }

  score += interactionPenalty(acordo.ultima_interacao_at)
  score = Math.max(0, Math.min(100, score))

  return {
    id: acordo.id,
    tipo: 'acordo',
    origem: 'Acordo',
    titulo: `${acordo.unidades?.responsavel_nome ?? 'Responsável não informado'} · Unidade ${acordo.unidades?.identificacao ?? '-'}`,
    subtitulo: `${acordo.condominios?.nome ?? '-'} · ${acordo.tipo ?? 'acordo'}`,
    status,
    valor,
    dataReferencia: vencimento,
    ultimaInteracaoAt: acordo.ultima_interacao_at,
    href: `/app/acordos/${acordo.id}`,
    score,
    prioridade: prioridadeFromScore(score),
    acao,
    motivo,
  }
}

export function buildCobrancaItem(cobranca: any): CockpitItem {
  const valor = Number(cobranca.valor_atualizado ?? 0)
  const status = String(cobranca.status ?? '')
  const daysOverdue = safeDaysFromToday(cobranca.vencimento)

  let score = moneyScore(valor)
  let acao = 'Acompanhar cobrança'
  let motivo = 'Cobrança em fluxo operacional.'

  if (['judicializado', 'suspenso', 'acordo efetivado'].includes(status)) {
    score -= 40
    acao = 'Sem ação imediata'
    motivo = 'Cobrança fora da fila operacional principal.'
  } else if (status === 'em negociação') {
    score += 45
    acao = 'Fechar acordo'
    motivo = 'Negociação aberta tem maior chance de conversão.'
  } else if (status === 'em cobrança ativa') {
    score += 30
    acao = 'Propor acordo'
    motivo = 'Cobrança ativa deve ser convertida em acordo.'
  } else if (status === 'novo') {
    score += 18
    acao = 'Iniciar contato'
    motivo = 'Nova cobrança precisa de primeiro movimento.'
  } else if (status === 'acordo firmado') {
    score += 10
    acao = 'Acompanhar acordo vinculado'
    motivo = 'Cobrança já convertida, foco passa ao cumprimento.'
  }

  if (daysOverdue !== null) {
    if (daysOverdue >= 60) score += 24
    else if (daysOverdue >= 30) score += 18
    else if (daysOverdue >= 15) score += 10
  }

  score += interactionPenalty(cobranca.ultima_interacao_at)
  score = Math.max(0, Math.min(100, score))

  return {
    id: cobranca.id,
    tipo: 'cobranca',
    origem: 'Cobrança',
    titulo: `${cobranca.unidades?.responsavel_nome ?? 'Responsável não informado'} · Unidade ${cobranca.unidades?.identificacao ?? '-'}`,
    subtitulo: `${cobranca.condominios?.nome ?? '-'} · competência ${cobranca.competencia ?? '-'}`,
    status,
    valor,
    dataReferencia: cobranca.vencimento,
    ultimaInteracaoAt: cobranca.ultima_interacao_at,
    href: `/app/cobrancas/${cobranca.id}`,
    score,
    prioridade: prioridadeFromScore(score),
    acao,
    motivo,
  }
}

export function priorityClasses(prioridade: CockpitItem['prioridade']) {
  if (prioridade === 'critica') return 'bg-red-50 text-red-700'
  if (prioridade === 'alta') return 'bg-amber-50 text-amber-700'
  if (prioridade === 'media') return 'bg-blue-50 text-blue-700'
  return 'bg-slate-100 text-slate-600'
}

export function scoreBarClass(prioridade: CockpitItem['prioridade']) {
  if (prioridade === 'critica') return 'bg-red-500'
  if (prioridade === 'alta') return 'bg-amber-500'
  if (prioridade === 'media') return 'bg-blue-500'
  return 'bg-slate-400'
}
