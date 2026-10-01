import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summarizeEmailMonitor, emailOperationStatus, type EmailMonitorMessage, type EmailMonitorAttempt } from '../features/mensageria/email-monitor-summary'
import { loadEmailMonitor } from '../features/mensageria/email-monitor-query'

const now = new Date('2026-10-01T01:00:00Z') // Ainda 30/09 em Brasília.
const base: EmailMonitorMessage = { id: 'm', carteira_id: 'c', status: 'agendada', agendada_para: '2026-09-30T12:00:00Z', sent_at: null, enviada_em: null, ultima_tentativa_em: null, updated_at: null, erro: null, erro_envio: null, lote_id: null }
const attempt: EmailMonitorAttempt = { id: 't', mensagem_id: 'm', carteira_id: 'c', estado: 'falha', iniciado_em: '2026-09-30T14:00:00Z', finalizado_em: '2026-09-30T14:01:00Z' }

test('usa o dia de Brasília, inclui atrasadas e ignora filas futuras e mensagens fora da agenda', () => {
  const result = summarizeEmailMonitor([base, { ...base, id: 'futura', agendada_para: '2026-10-01T03:00:00Z' }, { ...base, id: 'sem-agenda' }], [], ['c'], ['m', 'futura'], now)
  assert.equal(result.date, '2026-09-30')
  assert.equal(result.total.queued, 1)
  const sent = summarizeEmailMonitor([{ ...base, status: 'enviada', sent_at: '2026-09-30T02:59:59Z' }, { ...base, id: 'sent', status: 'enviada', sent_at: '2026-10-01T02:59:59Z' }], [], ['c'], [], now)
  assert.equal(sent.total.sent, 1)
})
test('última tentativa prevalece; reagendadas não contam como falha e incertas não entram na fila', () => {
  const result = summarizeEmailMonitor([base, { ...base, id: 'incerta', status: 'falha' }, { ...base, id: 'enviando' }], [attempt, { ...attempt, id: 'i', mensagem_id: 'incerta', estado: 'incerto' }, { ...attempt, id: 's', mensagem_id: 'enviando', estado: 'em_envio', finalizado_em: null }], ['c'], ['m', 'enviando'], now)
  assert.deepEqual(result.total, { sent: 0, queued: 1, failed: 0, uncertain: 1, sending: 1 })
  const recovered = summarizeEmailMonitor([{ ...base, status: 'enviada', sent_at: '2026-09-30T16:00:00Z' }], [attempt, { ...attempt, id: 'new', estado: 'enviado', iniciado_em: '2026-09-30T16:00:00Z', finalizado_em: '2026-09-30T16:01:00Z' }], ['c'], ['m'], now)
  assert.equal(recovered.total.sent, 1)
  assert.equal(recovered.issues.length, 0)
})
test('mantém pendências antigas para conferência sem inflar os totais de hoje', () => {
  const result = summarizeEmailMonitor([{ ...base, status: 'falha' }], [{ ...attempt, estado: 'incerto', iniciado_em: '2026-09-29T12:00:00Z', finalizado_em: '2026-09-29T12:00:00Z' }], ['c'], [], now)
  assert.equal(result.total.uncertain, 0)
  assert.equal(result.issues.length, 1)
  const cancelled = summarizeEmailMonitor([{ ...base, status: 'cancelada' }], [{ ...attempt, estado: 'incerto' }], ['c'], [], now)
  assert.equal(cancelled.issues.length, 1, 'Cancelar a agenda não esclarece um envio incerto')
  assert.equal(cancelled.total.failed, 0)
})
test('comunicação, teste, autorização e execução recente são sinais distintos', () => {
  const input = { enabled: true, transport: 'thunderbird', configured: false, now }
  const device = { automatico: true, testado_em: now.toISOString(), visto_em: now.toISOString() }
  assert.equal(emailOperationStatus(input).tone, 'red')
  assert.equal(emailOperationStatus({ ...input, device: { ...device, testado_em: null } }).tone, 'amber')
  assert.equal(emailOperationStatus({ ...input, device: { ...device, automatico: false } }).tone, 'gray')
  assert.equal(emailOperationStatus({ ...input, device: { ...device, visto_em: '2026-09-30T23:00:00Z' } }).tone, 'red')
  assert.equal(emailOperationStatus({ ...input, device }).tone, 'green')
  assert.equal(emailOperationStatus({ ...input, device: { ...device, visto_em: '2026-10-01T01:10:00Z' } }).tone, 'red')
  assert.equal(emailOperationStatus({ ...input, device, enabled: false }).tone, 'gray')
  const smtp = { ...input, transport: 'smtp', configured: true }
  assert.equal(emailOperationStatus(smtp).tone, 'amber')
  assert.equal(emailOperationStatus({ ...smtp, worker: { ultimo_sinal_em: '2026-10-01T00:50:00Z', metadata_json: { estado: 'operando' } } }).tone, 'green')
  assert.equal(emailOperationStatus({ ...smtp, worker: { ultimo_sinal_em: now.toISOString(), metadata_json: { estado: 'erro' } } }).tone, 'red')
})
test('consulta pagina todos os registros e não seleciona credenciais', async () => {
  const calls: { table: string; columns: string; key?: string }[] = []
  const rows: Record<string, any[]> = {
    carteiras: [{ id: 'c', nome: 'Carteira' }], email_agenda: Array.from({ length: 1001 }, (_, i) => ({ mensagem_id: String(i) })),
    mensagens: Array.from({ length: 1001 }, (_, i) => ({ ...base, id: String(i) })),
  }
  const db = { from(table: string) {
    const entry = { table, columns: '', key: '' }; calls.push(entry)
    let range = [0, 999]
    const q: any = { select(columns: string) { entry.columns = columns; return q }, order(key: string) { entry.key = key; return q }, range(a: number, b: number) { range = [a, b]; return q }, eq() { return q }, in() { return q }, then(resolve: any) { return Promise.resolve({ data: (rows[table] || []).slice(range[0], range[1] + 1), error: null }).then(resolve) } }
    return q
  } }
  const result = await loadEmailMonitor(now, db as any)
  assert.equal(result.total.queued, 1001)
  assert.equal(calls.filter(c => c.table === 'mensagens').length, 2)
  assert.equal(calls.find(c => c.table === 'email_agenda')?.key, 'mensagem_id')
  assert.equal(calls.some(c => /senha|token|secret/i.test(c.columns)), false)
})
