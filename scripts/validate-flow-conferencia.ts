import { test } from 'node:test'
import assert from 'node:assert/strict'
import { envioExigeConferencia } from '../features/flows/cobranca/conferencia-envio'

test('separa resultado incerto em cada transporte, inclusive mensagem cancelada', () => {
  for (const transporte of ['email_tentativas', 'whatsapp_web_envios', 'thunderbird_envios']) {
    assert.equal(envioExigeConferencia({ status: 'falha', [transporte]: [{ estado: 'incerto' }] }), true)
    assert.equal(envioExigeConferencia({ status: 'cancelada', [transporte]: [{ estado: 'incerto' }] }), true)
  }
})

test('confirmação posterior e falhas definitivas não ficam na conferência', () => {
  assert.equal(envioExigeConferencia({ status: 'enviada', email_tentativas: [{ estado: 'incerto' }] }), false)
  assert.equal(envioExigeConferencia({ status: 'falha', email_tentativas: [{ estado: 'falha' }] }), false)
  assert.equal(envioExigeConferencia({ status: 'agendada' }), false)
  assert.equal(envioExigeConferencia(null), false)
  assert.equal(envioExigeConferencia({ email_tentativas: [
    { estado: 'incerto', iniciado_em: '2026-11-23T01:00:00Z' },
    { estado: 'enviado', iniciado_em: '2026-11-24T01:00:00Z' },
  ] }), false)
})

test('estado incerto do provider também exige conferência', () => {
  assert.equal(envioExigeConferencia({ provider_status: 'incerto' }), true)
})
