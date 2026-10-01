import assert from 'node:assert/strict'
import { analyzePhone } from './sanear-telefones.mjs'

for (const [input, expected] of [
  ['11987654321', '5511987654321'],
  ['(11) 3456-7890', '551134567890'],
  ['5511987654321', '5511987654321'],
  ['011987654321', '5511987654321'],
  ['005511987654321', '5511987654321'],
  ['55987654321', '5555987654321'],
  ['99987654321', '5599987654321'],
]) {
  assert.equal(analyzePhone(input).normalized, expected)
  assert.equal(analyzePhone(expected).normalized, expected, 'Normalização deve ser idempotente')
}
for (const input of [
  '987654321', '00123456789', '11987654321 / 11912345678',
  '1198765432111912345678', '11987654321 ramal 10', '119876543',
  '119876543210', '20987654321', '11887654321',
]) assert.equal(analyzePhone(input).normalized, undefined, input)
assert.equal(analyzePhone(null).reason, 'vazio')
console.log('24 verificações de normalização e idempotência passaram.')
