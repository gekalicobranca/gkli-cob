import assert from 'node:assert/strict'
import { captacaoPayload } from '../features/condominios/captacao-payload'

const form = new FormData()
form.set('captacao_automatica_habilitada', 'on')
form.set('captacao_dia_mes', '')
assert.deepEqual(captacaoPayload(form, 'cadastro'), {})
assert.deepEqual(captacaoPayload(form, 'reguas'), {})
assert.throws(() => captacaoPayload(form, 'cobranca'), /dia mensal/)
for (const dia of ['0', '29', '10.5', 'abc']) {
  form.set('captacao_dia_mes', dia)
  assert.throws(() => captacaoPayload(form, 'cobranca'), /dia mensal/)
}
form.set('captacao_dia_mes', '15')
assert.deepEqual(captacaoPayload(form, 'cobranca'), {
  captacao_automatica_habilitada: true, captacao_dia_mes: 15, captacao_horario: '08:00',
})
form.delete('captacao_automatica_habilitada')
form.set('captacao_dia_mes', '')
assert.equal(captacaoPayload(form, 'cobranca').captacao_automatica_habilitada, false)
console.log('OK: cadastro e réguas preservam captação; cobrança valida o agendamento.')
