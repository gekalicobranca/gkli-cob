import { brasiliaDay } from './whatsapp-daily-summary'

export { brasiliaDay }
export type EmailCounts = { sent: number; queued: number; failed: number; uncertain: number; sending: number }
export type EmailMonitorMessage = {
  id: string; carteira_id: string | null; status: string; agendada_para: string | null
  sent_at: string | null; enviada_em: string | null; ultima_tentativa_em: string | null; updated_at: string | null
  erro_envio: string | null; erro: string | null; lote_id: string | null
}
export type EmailMonitorAttempt = {
  id: string; mensagem_id: string | null; carteira_id: string; estado: string
  iniciado_em: string; finalizado_em: string | null
}
const empty = (): EmailCounts => ({ sent: 0, queued: 0, failed: 0, uncertain: 0, sending: 0 })

export function summarizeEmailMonitor(messages: EmailMonitorMessage[], attempts: EmailMonitorAttempt[], walletIds: string[], agendaIds: string[], now: Date) {
  const day = brasiliaDay(now)
  const inDay = (value: string | null | undefined) => Boolean(value && Date.parse(value) >= Date.parse(day.start) && Date.parse(value) < Date.parse(day.end))
  const byWallet = Object.fromEntries(walletIds.map(id => [id, empty()]))
  const latest = new Map<string, EmailMonitorAttempt>()
  const agenda = new Set(agendaIds)
  for (const attempt of attempts) {
    if (!attempt.mensagem_id) continue
    const previous = latest.get(attempt.mensagem_id)
    if (!previous || Date.parse(attempt.iniciado_em) > Date.parse(previous.iniciado_em)) latest.set(attempt.mensagem_id, attempt)
  }
  const issues: { message: EmailMonitorMessage; state: string; at: string | null }[] = []
  for (const message of messages) {
    const counts = message.carteira_id ? byWallet[message.carteira_id] : null
    if (!counts) continue
    const attempt = latest.get(message.id)
    const at = attempt?.finalizado_em || attempt?.iniciado_em || message.ultima_tentativa_em || message.updated_at
    if (message.status === 'enviada') {
      if (inDay(message.sent_at || message.enviada_em || (attempt?.estado === 'enviado' ? at : null))) counts.sent++
      continue
    }
    if (attempt?.estado === 'incerto' || attempt?.estado === 'em_envio') {
      const state = attempt.estado === 'incerto' ? 'uncertain' : 'sending'
      if (inDay(at)) counts[state]++
      issues.push({ message, state, at })
      continue
    }
    if (message.status === 'cancelada') continue
    if (message.status === 'agendada' && agenda.has(message.id) && message.agendada_para && Date.parse(message.agendada_para) < Date.parse(day.end)) {
      counts.queued++
    }
    if (message.status === 'falha') {
      if (inDay(at)) counts.failed++
      issues.push({ message, state: 'failed', at })
    }
  }
  const total = empty()
  for (const counts of Object.values(byWallet)) for (const key of Object.keys(total) as (keyof EmailCounts)[]) total[key] += counts[key]
  issues.sort((a, b) => Date.parse(b.at || '') - Date.parse(a.at || ''))
  return { ...day, byWallet, total, issues }
}

export function emailOperationStatus(input: {
  enabled: boolean; transport: string; configured: boolean; now: Date
  device?: { automatico: boolean; testado_em: string | null; visto_em: string | null } | null
  worker?: { ultimo_sinal_em: string | null; metadata_json: any } | null
}) {
  const result = (tone: 'green' | 'amber' | 'red' | 'gray', title: string, detail: string, next: string) => ({ tone, title, detail, next })
  const fresh = (value: string | null | undefined, maxAge = 180000) => {
    const age = input.now.getTime() - Date.parse(value || '')
    return Number.isFinite(age) && age >= -30000 && age < maxAge
  }
  if (!input.enabled) return result('gray', 'Canal pausado', 'O envio de e-mails está desabilitado nesta carteira.', 'Revise a habilitação de e-mail no cadastro da carteira para retomar os envios.')
  if (input.transport === 'thunderbird') {
    if (!input.device) return result('red', 'Thunderbird não vinculado', 'Nenhum dispositivo ativo está vinculado à carteira.', 'Vincule a conta correta em Integrações.')
    if (!input.device.testado_em) return result('amber', 'Teste de envio pendente', 'O dispositivo foi vinculado, mas ainda não concluiu o teste de envio.', 'Conclua o teste no Thunderbird antes de ativar a fila automática.')
    if (!input.device.automatico) return result('gray', 'Fila automática pausada', 'A conta foi testada, mas a fila automática está desabilitada.', 'Abra a extensão GKLI no Thunderbird para retomar a fila.')
    if (!fresh(input.device.visto_em)) return result('red', 'Sem comunicação recente', 'O Thunderbird não se comunicou com o sistema nos últimos 3 minutos.', 'Verifique se o computador está ligado, com internet, e se o Thunderbird e a extensão estão abertos.')
    return result('green', 'Thunderbird em comunicação', 'Há comunicação recente, teste concluído e fila automática habilitada. Isso não confirma a entrega ao destinatário.', 'Acompanhe a fila e confira os envios sem confirmação antes de tentar reenviar.')
  }
  if (!input.configured) return result('red', 'SMTP não configurado', 'Não há uma configuração ativa com servidor e remetente para esta carteira.', 'Configure a conta de envio em Integrações.')
  if (!fresh(input.worker?.ultimo_sinal_em, 15 * 60000)) return result('amber', 'SMTP configurado · sem execução recente', 'A configuração está disponível, mas não há sinal de execução nos últimos 15 minutos. A rotina pode ficar sem executar quando não há mensagens elegíveis. A autenticação SMTP não foi verificada por esta consulta.', 'Se houver mensagens vencidas na fila, verifique a rotina automática e o teste na integração.')
  if (input.worker?.metadata_json?.estado === 'erro') return result('red', 'Falha na rotina de e-mails', 'A última execução da rotina de envio informou erro.', 'Confira as falhas abaixo e revise a integração de envio.')
  if (input.worker?.metadata_json?.estado !== 'operando') return result('amber', 'Execução não confirmada', 'Há um sinal recente, mas ele não informa uma execução válida da rotina de e-mails.', 'Confira a rotina automática de e-mails e atualize o painel.')
  return result('green', 'Rotina SMTP em execução', 'Há configuração ativa e uma execução recente da rotina. Esse sinal é compartilhado pelas carteiras SMTP e não comprova autenticação ou entrega.', 'Acompanhe os resultados de envio desta carteira.')
}
