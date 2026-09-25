import { test } from 'node:test'
import assert from 'node:assert/strict'
import { whatsappOperationStatus } from '../features/mensageria/whatsapp-operation-status'

const now = Date.parse('2026-09-23T20:00:00Z')
const date = new Date(now).toISOString()
const base = {
  now, expectedPhone: '5511914750545',
  session: { status: 'conectado', numero: '5511914750545', atualizado_em: date },
  control: { habilitado: true, reiniciar_id: 'a', aplicado_id: 'a', atualizado_em: date, supervisor_em: date, supervisor_status: 'supervisionando' },
  monitor: { ultimo_sinal_em: date, metadata_json: { estado: 'operando' } },
}
test('disabled wallet channel takes priority over a connected and authorized worker', () => {
  const state = whatsappOperationStatus({ ...base, channelEnabled: false })
  assert.equal(state.tone, 'amber')
  assert.equal(state.title, 'WhatsApp desabilitado na carteira')
  assert.match(state.next, /cadastro da carteira/)
})
test('green requires current connection, matching number and active processing', () => {
  assert.equal(whatsappOperationStatus(base).tone, 'green')
  assert.equal(whatsappOperationStatus({ ...base, monitor: undefined }).tone, 'amber')
  assert.equal(whatsappOperationStatus({ ...base, monitor: { ...base.monitor, metadata_json: { estado: 'conexao' } } }).tone, 'amber')
  assert.equal(whatsappOperationStatus({ ...base, expectedPhone: 'other' }).tone, 'red')
})
test('pending pause does not claim the worker has already stopped', () => {
  const state = whatsappOperationStatus({ ...base, control: { ...base.control, habilitado: false, aplicado_id: null } })
  assert.equal(state.title, 'Pausa solicitada')
  assert.match(state.command!, /Pedido de pausa/)
})
test('pending command explains missing supervisor and elapsed time', () => {
  const state = whatsappOperationStatus({ ...base, control: { ...base.control, aplicado_id: null, supervisor_em: null, atualizado_em: new Date(now - 180000).toISOString() } })
  assert.match(state.command!, /há 3 min/)
  assert.match(state.command!, /sem sinal recente/)
})
test('old and implausibly future signals never confirm operation', () => {
  for (const delta of [-120000, 60000]) {
    assert.equal(whatsappOperationStatus({ ...base, session: { ...base.session, atualizado_em: new Date(now + delta).toISOString() } }).tone, 'red')
  }
})
test('command acknowledgement is not connection confirmation', () => {
  assert.equal(whatsappOperationStatus({ ...base, session: { ...base.session, status: 'iniciando' } }).title, 'Conectando · ainda não está pronto')
  assert.match(whatsappOperationStatus({ ...base, session: { ...base.session, status: 'aguardando_qr' } }).title, /vincular WhatsApp/)
})
test('supervisor failure is separate from a worker that still operates', () => {
  const state = whatsappOperationStatus({ ...base, control: { ...base.control, supervisor_em: null } })
  assert.equal(state.tone, 'green')
  assert.match(state.next, /sem sinal recente/)
})
