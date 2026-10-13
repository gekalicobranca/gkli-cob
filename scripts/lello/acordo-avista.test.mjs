import test from 'node:test'
import assert from 'node:assert/strict'
import { planejarAcordoAvista } from './acordo-avista.mjs'
const input = { referencia: '63004', unidade: '600002', recibos: ['53235964'], vencimento: '2026-10-20', baseCentavos: 38909, percentual: 10 }
test('preserva divergência de um centavo dentro da tolerância sem finalizar', () => {
  const p = planejarAcordoAvista({ ...input, totalPortalCentavos: 42799 })
  assert.equal(p.totalCentavos, 42800)
  assert.equal(p.divergenciaCentavos, -1)
  assert.equal(p.exigeRevisao, false)
  assert.equal(p.finalizarAutomaticamente, false)
})
test('tolerância inclui 50 centavos, mas não 51, em ambos os sentidos', () => {
  for (const delta of [-50, 50]) assert.equal(planejarAcordoAvista({ ...input, totalPortalCentavos: 42800 + delta }).exigeRevisao, false)
  for (const delta of [-51, 51]) assert.equal(planejarAcordoAvista({ ...input, totalPortalCentavos: 42800 + delta }).exigeRevisao, true)
})
test('acordo existente impede novo lançamento', () => assert.equal(planejarAcordoAvista({ ...input, acordoExistente: '1398404' }).acao, 'consultar_acordo_existente'))
test('rejeita data inválida e centavos fracionários', () => {
  assert.throws(() => planejarAcordoAvista({ ...input, vencimento: '2026-02-30' }))
  assert.throws(() => planejarAcordoAvista({ ...input, baseCentavos: 389.09 }))
})
