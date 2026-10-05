import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestCodeInPage } from './pairing-code.mjs'

test('429 inicial e na renovação interrompem novas tentativas e preservam classificação', async () => {
  const originalInterval = globalThis.setInterval
  const originalClear = globalThis.clearInterval
  let tick, scheduled, codes, failures, attempts
  globalThis.setInterval = fn => { tick = fn; scheduled = true; return 1 }
  globalThis.clearInterval = () => { scheduled = false }
  try {
    for (const firstFails of [true, false]) {
      scheduled = false; codes = []; failures = []; attempts = 0
      globalThis.window = {
        AuthStore: { AppState: { state: 'UNPAIRED' }, PairingCodeLinkUtils: {
          setPairingType() {}, async initializeAltDeviceLinking() {},
          async startAltLinkingFlow() {
            attempts++
            if (firstFails || attempts > 1) throw { type: { name: 'IQErrorRateOverlimit', value: { code: 429 } } }
            return 'ABCD1234'
          },
        } },
        onCodeReceivedEvent: async code => codes.push(code),
        onPairingFailureEvent: async reason => failures.push(reason),
      }
      assert.equal(await requestCodeInPage('phone', true, 180000), firstFails ? null : 'ABCD1234')
      if (!firstFails) { assert.equal(scheduled, true); await tick() }
      assert.equal(scheduled, false)
      assert.deepEqual(failures, ['rate_limit'])
      assert.deepEqual(codes, firstFails ? [] : ['ABCD1234'])
    }
  } finally {
    globalThis.setInterval = originalInterval; globalThis.clearInterval = originalClear
    delete globalThis.window
  }
})
