import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resumirMonitor } from '../features/agente-automatico/monitor'

const now = Date.parse('2026-09-15T21:10:00Z')
const base = { status: 'pendente', created_at: '2026-09-15T21:04:00Z' }
test('fila sem agente não é apresentada como execução em andamento ou falha terminal', () => {
  const result = resumirMonitor(base, null, null, '2026-08-31T23:59:00Z', now)
  assert.equal(result.state, 'attention')
  assert.equal(result.online, false)
  assert.equal(result.terminal, false)
})
test('agente que volta a enviar sinal libera acompanhamento da fila', () => {
  assert.equal(resumirMonitor(base, null, null, new Date(now - 15000).toISOString(), now).state, 'running')
})
test('coleta concluída não implica importação concluída', () => {
  const result = resumirMonitor({ ...base, status: 'sucesso', finalizado_em: new Date(now).toISOString() }, {}, null, null, now)
  assert.equal(result.state, 'running')
  assert.equal(result.terminal, false)
})
test('validação humana continua monitorada e importação concluída encerra', () => {
  const e = { ...base, status: 'sucesso' }
  const c = { status: 'aguardando_validacao', criado_em: base.created_at }
  assert.equal(resumirMonitor(e, {}, c, null, now).state, 'attention')
  assert.equal(resumirMonitor(e, {}, c, null, now).terminal, false)
  assert.equal(resumirMonitor(e, {}, { ...c, status: 'concluido' }, null, now).terminal, true)
})
test('falha da coleta prevalece sobre conversão e preserva a mensagem', () => {
  const result = resumirMonitor({ ...base, status: 'falha', erro_mensagem: 'Portal indisponível' }, {}, { status: 'concluido', criado_em: base.created_at }, null, now)
  assert.equal(result.state, 'error')
  assert.equal(result.detail, 'Portal indisponível')
  assert.equal(result.terminal, true)
})
