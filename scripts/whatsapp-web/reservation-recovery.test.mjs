import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reservationRecovery } from './reservation-recovery.mjs'

test('falha de reserva preserva loop e reconcilia antes de obter outra mensagem', async () => {
  const events = []
  let online = false
  const next = reservationRecovery({
    reserve: async () => { events.push('reserve'); if (!online) throw Error('fetch failed'); return { id: 'next' } },
    reconcile: async () => { events.push('reconcile'); if (!online) throw Error('offline') },
    report: () => events.push('report'),
  })
  assert.equal(await next(), null)
  assert.equal(await next(), null)
  assert.deepEqual(events, ['reserve', 'report', 'reconcile', 'report'])
  online = true
  assert.deepEqual(await next(), { id: 'next' })
  assert.deepEqual(events.slice(-2), ['reconcile', 'reserve'])
})

test('reserva com resposta perdida ou commit tardio nunca é entregue novamente', async () => {
  let calls = 0
  const pending = [], uncertain = [], delivered = []
  const next = reservationRecovery({
    reserve: async () => {
      calls++
      if (calls === 1) { pending.push('lost'); throw Error('response lost') }
      return { id: `new-${calls}` }
    },
    reconcile: async () => { uncertain.push(...pending.splice(0)) },
    report: () => {},
  })
  assert.equal(await next(), null)
  delivered.push((await next()).id)
  pending.push('late-commit')
  delivered.push((await next()).id)
  assert.deepEqual(uncertain, ['lost', 'late-commit'])
  assert.deepEqual(delivered, ['new-2', 'new-3'])
})
