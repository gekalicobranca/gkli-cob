export type DailyCounts = { sent: number; queued: number; failed: number; uncertain: number }
export type DailyAttempt = { mensagem_id: string; sessao: string; estado: string; iniciado_em: string; finalizado_em: string | null; mensagem: { status: string } | { status: string }[] | null }
export function brasiliaDay(now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const start = new Date(`${date}T00:00:00-03:00`)
  return { date, start: start.toISOString(), end: new Date(start.getTime() + 86400000).toISOString() }
}
export function summarizeWhatsappDay(attempts: DailyAttempt[], queue: { id: string; carteira_id: string }[], wallets: { id: string; whatsapp_web_sessao: string | null }[], start: string, end: string) {
  const empty = (): DailyCounts => ({ sent: 0, queued: 0, failed: 0, uncertain: 0 })
  const byWallet = Object.fromEntries(wallets.map(w => [w.id, empty()]))
  const latest = new Map<string, DailyAttempt>()
  for (const attempt of attempts) {
    const previous = latest.get(attempt.mensagem_id)
    if (!previous || attempt.iniciado_em > previous.iniciado_em) latest.set(attempt.mensagem_id, attempt)
  }
  for (const attempt of latest.values()) {
    const at = Date.parse(attempt.finalizado_em || attempt.iniciado_em)
    if (at < Date.parse(start) || at >= Date.parse(end)) continue
    const message = Array.isArray(attempt.mensagem) ? attempt.mensagem[0] : attempt.mensagem
    const wallet = wallets.find(w => w.whatsapp_web_sessao === attempt.sessao)
    if (!wallet || !message) continue
    const counts = byWallet[wallet.id]
    if (attempt.estado === 'enviado' && message.status === 'enviada') counts.sent++
    if (attempt.estado === 'falha' && message.status === 'falha') counts.failed++
    if (attempt.estado === 'incerto' && message.status === 'falha') counts.uncertain++
  }
  for (const item of queue) if (byWallet[item.carteira_id]) byWallet[item.carteira_id].queued++
  const total = Object.values(byWallet).reduce((sum, item) => ({ sent: sum.sent + item.sent, queued: sum.queued + item.queued, failed: sum.failed + item.failed, uncertain: sum.uncertain + item.uncertain }), empty())
  return { total, byWallet }
}
