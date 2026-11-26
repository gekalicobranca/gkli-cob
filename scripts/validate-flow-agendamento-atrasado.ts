import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agendamentoAtrasado } from '../features/flows/cobranca/agendamento-atrasado'

test('agenda vencida usa instante absoluto e respeita o limite do horário', () => {
  const m = { status: 'agendada', agendada_para: '2026-11-26T00:10:00-03:00' }
  assert.equal(agendamentoAtrasado(m, Date.parse('2026-11-26T03:09:59Z')), false)
  assert.equal(agendamentoAtrasado(m, Date.parse('2026-11-26T03:10:00Z')), false)
  assert.equal(agendamentoAtrasado(m, Date.parse('2026-11-26T03:10:01Z')), true)
})

test('não trata confirmação, falha ou cancelamento como atraso de agenda', () => {
  const m = { agendada_para: '2026-11-26T03:10:00Z' }
  const now = Date.parse('2026-11-26T14:00:00Z')
  for (const status of ['enviada', 'falha', 'cancelada']) assert.equal(agendamentoAtrasado({ ...m, status }, now), false)
  assert.equal(agendamentoAtrasado({ ...m, status: 'agendada', sent_at: m.agendada_para }, now), false)
})

test('suporta agenda legada e não inventa atraso com data ausente ou inválida', () => {
  const now = Date.parse('2026-11-26T14:00:00Z')
  assert.equal(agendamentoAtrasado({ status_operacional: 'agendada', scheduled_at: '2026-11-26T03:10:00Z' }, now), true)
  assert.equal(agendamentoAtrasado({ status: 'agendada' }, now), false)
  assert.equal(agendamentoAtrasado({ status: 'agendada', agendada_para: 'inválida' }, now), false)
  assert.equal(agendamentoAtrasado({ status: 'agendada' }, null), false)
})
