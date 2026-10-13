import test from 'node:test'
import assert from 'node:assert/strict'
import { planejarAcordoAvista } from './acordo-avista.mjs'
const input = { referencia: '63004', unidade: '600002', recibos: ['53235964'], vencimento: '2026-10-20', baseCentavos: 38909, percentual: 10 }
test('detecta divergência de um centavo sem finalizar', () => {
  const p = planejarAcordoAvista({ ...input, totalPortalCentavos: 42799 })
  assert.equal(p.totalCentavos, 42800)
  assert.equal(p.divergenciaCentavos, -1)
  assert.equal(p.exigeRevisao, true)
  assert.equal(p.finalizarAutomaticamente, false)
})
test('acordo existente impede novo lançamento', () => assert.equal(planejarAcordoAvista({ ...input, acordoExistente: '1398404' }).acao, 'consultar_acordo_existente'))
test('rejeita data inválida e centavos fracionários', () => {
  assert.throws(() => planejarAcordoAvista({ ...input, vencimento: '2026-02-30' }))
  assert.throws(() => planejarAcordoAvista({ ...input, baseCentavos: 389.09 }))
})
