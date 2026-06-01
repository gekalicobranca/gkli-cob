import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

export type MensageriaPrioridade = 'critica' | 'alta' | 'media' | 'baixa'

export type MensageriaInsight = {
  id: string
  titulo: string
  descricao: string
  prioridade: MensageriaPrioridade
  tipo: 'falha' | 'pendencia' | 'retorno' | 'canal' | 'template' | 'engajamento'
  acao: string
  href?: string
}

export type MensageriaRecomendacao = {
  id: string
  mensagemId: string
  loteId: string | null
  canalAtual: string
  canalSugerido: 'whatsapp' | 'email'
  horarioSugerido: string
  templateSugerido: string
  riscoNaoResposta: number
  scoreEngajamento: number
  motivo: string
  href?: string
}

export type MensageriaInteligencia = {
  metrics: {
    mensagensMonitoradas: number
    pendentes: number
    aprovadas: number
    enviadas: number
    falhas: number
    aguardandoRetorno: number
    whatsappSemNumero: number
    scoreMedioEngajamento: number
    riscoMedioNaoResposta: number
  }
  insights: MensageriaInsight[]
  recomendacoes: MensageriaRecomendacao[]
}

type MensagemBase = {
  id: string
  carteira_id: string | null
  lote_id: string | null
  contexto: string | null
  canal: string | null
  destinatario: string | null
  status: string | null
  status_operacional: string | null
  conteudo_renderizado: string | null
  tentativas_envio: number | null
  opened_whatsapp_at: string | null
  enviada_manual: boolean | null
  ultima_tentativa_em: string | null
  proxima_tentativa_em: string | null
  ultimo_erro: string | null
  erro_envio: string | null
  whatsapp_numero: string | null
  email_destinatario: string | null
  created_at: string
}

function n(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function daysSince(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86_400_000))
}

function statusOf(message: MensagemBase) {
  return message.status_operacional || message.status || 'rascunho'
}

function hasWhatsapp(message: MensagemBase) {
  const phone = message.whatsapp_numero || message.destinatario
  return /\d{10,}/.test(String(phone ?? '').replace(/\D/g, ''))
}

function hasEmail(message: MensagemBase) {
  const email = message.email_destinatario || message.destinatario
  return /@/.test(String(email ?? ''))
}

function suggestedChannel(message: MensagemBase): 'whatsapp' | 'email' {
  if (hasWhatsapp(message)) return 'whatsapp'
  return 'email'
}

function suggestedTemplate(message: MensagemBase) {
  if (message.contexto === 'acordo') return 'Acordo — lembrete preventivo'
  if (statusOf(message) === 'falha') return 'Cobrança amigável inicial'
  if (n(message.tentativas_envio) >= 2) return 'Cobrança firme'
  return 'Cobrança amigável inicial'
}

function suggestedTime(message: MensagemBase) {
  const status = statusOf(message)
  if (status === 'aguardando_retorno') return '14h às 16h'
  if (message.contexto === 'acordo') return '9h às 11h'
  return '10h às 12h'
}

function riskOfNoResponse(message: MensagemBase) {
  let score = 25
  const status = statusOf(message)

  if (status === 'falha') score += 35
  if (status === 'aguardando_retorno') score += 25
  if (!hasWhatsapp(message) && message.canal === 'whatsapp') score += 30
  if (n(message.tentativas_envio) >= 2) score += 18
  if (daysSince(message.ultima_tentativa_em || message.created_at) !== null && Number(daysSince(message.ultima_tentativa_em || message.created_at)) >= 3) score += 12
  if (message.opened_whatsapp_at) score -= 15
  if (message.status === 'enviada' || message.status_operacional === 'enviada') score -= 30

  return Math.max(0, Math.min(100, score))
}

function engagementScore(message: MensagemBase) {
  let score = 70
  const risk = riskOfNoResponse(message)
  score -= Math.round(risk * 0.45)
  if (message.opened_whatsapp_at) score += 10
  if (message.enviada_manual) score += 8
  if (message.status === 'falha' || message.status_operacional === 'falha') score -= 20
  return Math.max(0, Math.min(100, score))
}

function priorityFromRisk(risk: number): MensageriaPrioridade {
  if (risk >= 80) return 'critica'
  if (risk >= 60) return 'alta'
  if (risk >= 35) return 'media'
  return 'baixa'
}

function avg(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildInsights(messages: MensagemBase[]): MensageriaInsight[] {
  const falhas = messages.filter((message) => statusOf(message) === 'falha')
  const pendentes = messages.filter((message) => statusOf(message) === 'pendente_aprovacao')
  const retorno = messages.filter((message) => statusOf(message) === 'aguardando_retorno')
  const whatsappSemNumero = messages.filter((message) => message.canal === 'whatsapp' && !hasWhatsapp(message))
  const altas = messages.filter((message) => riskOfNoResponse(message) >= 60)

  const insights: MensageriaInsight[] = []

  if (falhas.length) {
    insights.push({
      id: 'falhas-envio',
      titulo: `${falhas.length} mensagem(ns) com falha`,
      descricao: 'Reprocesse ou ajuste canal/destinatário antes do próximo ciclo da régua.',
      prioridade: 'critica',
      tipo: 'falha',
      acao: 'Revisar falhas',
      href: '/app/mensageria/log',
    })
  }

  if (pendentes.length) {
    insights.push({
      id: 'pendentes-aprovacao',
      titulo: `${pendentes.length} mensagem(ns) aguardando aprovação`,
      descricao: 'Há mensagens geradas pela régua que ainda não foram liberadas para envio.',
      prioridade: pendentes.length >= 20 ? 'alta' : 'media',
      tipo: 'pendencia',
      acao: 'Abrir lotes',
      href: '/app/lotes',
    })
  }

  if (retorno.length) {
    insights.push({
      id: 'aguardando-retorno',
      titulo: `${retorno.length} contato(s) aguardando retorno`,
      descricao: 'Priorize follow-up no período da tarde para conversas já iniciadas.',
      prioridade: retorno.length >= 10 ? 'alta' : 'media',
      tipo: 'retorno',
      acao: 'Planejar follow-up',
      href: '/app/mensageria',
    })
  }

  if (whatsappSemNumero.length) {
    insights.push({
      id: 'whatsapp-sem-numero',
      titulo: `${whatsappSemNumero.length} WhatsApp(s) sem número válido`,
      descricao: 'Essas mensagens devem migrar para e-mail ou exigir correção cadastral da unidade.',
      prioridade: 'alta',
      tipo: 'canal',
      acao: 'Corrigir destinatários',
      href: '/app/unidades',
    })
  }

  if (altas.length) {
    insights.push({
      id: 'risco-nao-resposta',
      titulo: `${altas.length} mensagem(ns) com alto risco de não resposta`,
      descricao: 'Considere trocar template, canal ou horário antes de nova tentativa.',
      prioridade: 'alta',
      tipo: 'engajamento',
      acao: 'Ver recomendações',
      href: '/app/mensageria/inteligencia',
    })
  }

  if (!insights.length) {
    insights.push({
      id: 'operacao-estavel',
      titulo: 'Mensageria sem gargalos críticos',
      descricao: 'Não há falhas relevantes ou pendências críticas no recorte analisado.',
      prioridade: 'baixa',
      tipo: 'engajamento',
      acao: 'Monitorar operação',
      href: '/app/mensageria',
    })
  }

  return insights
}

function buildRecommendations(messages: MensagemBase[]): MensageriaRecomendacao[] {
  return messages
    .map((message) => {
      const risk = riskOfNoResponse(message)
      const score = engagementScore(message)
      const canalSugerido = suggestedChannel(message)
      const canalAtual = message.canal || 'whatsapp'
      const status = statusOf(message)

      let motivo = 'Mensagem dentro do fluxo normal de acompanhamento.'
      if (status === 'falha') motivo = 'Falha recente: revisar destinatário, canal ou template antes de nova tentativa.'
      else if (status === 'aguardando_retorno') motivo = 'Contato já iniciado: follow-up no período da tarde tende a ser mais efetivo.'
      else if (canalAtual === 'whatsapp' && !hasWhatsapp(message)) motivo = 'WhatsApp sem número válido: trocar para e-mail ou corrigir cadastro.'
      else if (n(message.tentativas_envio) >= 2) motivo = 'Múltiplas tentativas: usar abordagem mais firme ou canal alternativo.'

      return {
        id: `rec-${message.id}`,
        mensagemId: message.id,
        loteId: message.lote_id,
        canalAtual,
        canalSugerido,
        horarioSugerido: suggestedTime(message),
        templateSugerido: suggestedTemplate(message),
        riscoNaoResposta: risk,
        scoreEngajamento: score,
        motivo,
        href: message.lote_id ? `/app/lotes/${message.lote_id}` : '/app/mensageria',
      }
    })
    .filter((item) => item.riscoNaoResposta >= 35 || item.canalAtual !== item.canalSugerido)
    .sort((a, b) => b.riscoNaoResposta - a.riscoNaoResposta)
    .slice(0, 12)
}

export async function getMensageriaInteligencia(scope: CarteiraScope): Promise<MensageriaInteligencia> {
  const supabase = await createClient()

  let query = supabase
    .from('mensagens')
    .select('id,carteira_id,lote_id,contexto,canal,destinatario,status,status_operacional,conteudo_renderizado,tentativas_envio,opened_whatsapp_at,enviada_manual,ultima_tentativa_em,proxima_tentativa_em,ultimo_erro,erro_envio,whatsapp_numero,email_destinatario,created_at')
    .order('created_at', { ascending: false })
    .limit(300)

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    console.error('Erro ao carregar inteligência da mensageria:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })

    return {
      metrics: {
        mensagensMonitoradas: 0,
        pendentes: 0,
        aprovadas: 0,
        enviadas: 0,
        falhas: 0,
        aguardandoRetorno: 0,
        whatsappSemNumero: 0,
        scoreMedioEngajamento: 0,
        riscoMedioNaoResposta: 0,
      },
      insights: [],
      recomendacoes: [],
    }
  }

  const messages = (data ?? []) as MensagemBase[]
  const risks = messages.map(riskOfNoResponse)
  const scores = messages.map(engagementScore)

  return {
    metrics: {
      mensagensMonitoradas: messages.length,
      pendentes: messages.filter((message) => statusOf(message) === 'pendente_aprovacao').length,
      aprovadas: messages.filter((message) => statusOf(message) === 'aprovada').length,
      enviadas: messages.filter((message) => statusOf(message) === 'enviada').length,
      falhas: messages.filter((message) => statusOf(message) === 'falha').length,
      aguardandoRetorno: messages.filter((message) => statusOf(message) === 'aguardando_retorno').length,
      whatsappSemNumero: messages.filter((message) => message.canal === 'whatsapp' && !hasWhatsapp(message)).length,
      scoreMedioEngajamento: Math.round(avg(scores)),
      riscoMedioNaoResposta: Math.round(avg(risks)),
    },
    insights: buildInsights(messages),
    recomendacoes: buildRecommendations(messages),
  }
}
