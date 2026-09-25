import assert from 'node:assert/strict'
import { brasiliaDay, summarizeWhatsappDay, type DailyAttempt } from '../features/mensageria/whatsapp-daily-summary'
const day = brasiliaDay(new Date('2026-09-26T02:59:59Z'))
assert.equal(day.start, '2026-09-25T03:00:00.000Z')
assert.equal(day.end, '2026-09-26T03:00:00.000Z')
assert.equal(brasiliaDay(new Date(day.end)).date, '2026-09-26')
const attempt = (id: string, estado: string, status: string, at = '2026-09-25T14:00:00Z'): DailyAttempt => ({ mensagem_id: id, sessao: 'gekali', estado, iniciado_em: at, finalizado_em: at, mensagem: { status } })
const result = summarizeWhatsappDay([
  attempt('sent', 'enviado', 'enviada'),
  attempt('sent', 'falha', 'enviada', '2026-09-25T13:00:00Z'),
  attempt('recovered', 'falha', 'agendada'),
  attempt('uncertain', 'incerto', 'falha'),
  attempt('failed', 'falha', 'falha'),
  attempt('failed', 'falha', 'falha', '2026-09-25T13:00:00Z'),
  attempt('tomorrow', 'enviado', 'enviada', day.end),
], [{ id: 'recovered', carteira_id: 'g' }, { id: 'other', carteira_id: 'cloud' }], [{ id: 'g', whatsapp_web_sessao: 'gekali' }], day.start, day.end)
assert.deepEqual(result.total, { sent: 1, queued: 1, failed: 1, uncertain: 1 })
console.log('Resumo diário: fuso de Brasília, virada do dia, recuperação, deduplicação e incertos verificados.')
