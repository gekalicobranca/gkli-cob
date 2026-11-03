import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertMessageRoute } from './route.mjs'

test('requires the effective database route again before transmission', () => {
  const route = { carteira_id: 'gekali', transporte: 'web', sessao: 'riseup', numero: '5511973641030' }
  assert.doesNotThrow(() => assertMessageRoute(route, 'riseup', '5511973641030', 'gekali'))
  for (const change of [null, { ...route, sessao: 'gekali' }, { ...route, numero: '5511914750545' },
    { ...route, carteira_id: 'outra' }, { ...route, transporte: 'cloud' }]) {
    assert.throws(() => assertMessageRoute(change, 'riseup', '5511973641030', 'gekali'))
  }
})
