import assert from 'node:assert/strict'
import { test } from 'node:test'
import { novosEventosRegistro, type RegistroKeilaJSON } from '../features/keila/registro-json'
import { validarLinkWebmail } from '../features/keila/webmail'

const evento: RegistroKeilaJSON['eventos'][number] = { id: 'consulta-1', em: '2026-10-11T23:00:00Z', tipo: 'consulta_remota', resumo: 'Relatório conferido', dados: { fonte: 'Lello', valores: { abril: 495.38, junho: 487.3 } } }
test('reprocessamento independe da ordem das chaves JSONB e não duplica eventos', () => {
  const banco = { ...evento, dados: { valores: { junho: 487.3, abril: 495.38 }, fonte: 'Lello' } }
  assert.deepEqual(novosEventosRegistro([banco], [evento]), [])
  assert.deepEqual(novosEventosRegistro([], [evento, evento]), [evento])
})
test('mesmo identificador com conteúdo alterado não sobrescreve o histórico', () => {
  assert.throws(() => novosEventosRegistro([evento], [{ ...evento, resumo: 'Outro conteúdo' }]), /outro conteúdo/)
})
test('aceita o domínio atual do Outlook e recusa domínio parecido', () => {
  assert.equal(validarLinkWebmail('https://outlook.cloud.microsoft/mail/id/abc'), 'https://outlook.cloud.microsoft/mail/id/abc')
  assert.throws(() => validarLinkWebmail('https://outlook.cloud.microsoft.example/mail/id/abc'))
})
