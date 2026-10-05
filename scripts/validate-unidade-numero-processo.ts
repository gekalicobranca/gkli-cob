import assert from 'node:assert/strict'
import { normalizarNumeroProcesso } from '../features/unidades/numero-processo'

assert.equal(normalizarNumeroProcesso(null), null)
assert.equal(normalizarNumeroProcesso('  '), null)
assert.equal(normalizarNumeroProcesso('10122657420228260348'), '1012265-74.2022.8.26.0348')
assert.equal(normalizarNumeroProcesso('4008211--40.2025.8.26.0564'), '4008211-40.2025.8.26.0564')
assert.equal(normalizarNumeroProcesso('1016875-14.2025.8.26,0564'), '1016875-14.2025.8.26.0564')
assert.throws(() => normalizarNumeroProcesso('4006015-16.8.26.0009'), /20 dígitos/)
assert.throws(() => normalizarNumeroProcesso('processo 10122657420228260348'), /20 dígitos/)
assert.equal(normalizarNumeroProcesso(normalizarNumeroProcesso('10122657420228260348')), '1012265-74.2022.8.26.0348')
console.log('Número do processo: normalização, ausência e rejeição de valores incompletos verificadas.')
