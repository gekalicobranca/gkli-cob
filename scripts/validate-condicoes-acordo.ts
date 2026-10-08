import assert from 'node:assert/strict'
import { condicoesAcordoPayload, percentualDespesas } from '../features/condominios/condicoes-acordo'
assert.equal(percentualDespesas('10,50'),10.5)
assert.equal(percentualDespesas('10.50'),10.5)
assert.equal(percentualDespesas(0),0)
for (const valor of ['', null, -1, 101, 'abc', '10.001']) assert.throws(() => percentualDespesas(valor))
const outraAba = new FormData()
assert.deepEqual(condicoesAcordoPayload(outraAba), {})
outraAba.set('despesas_acordo_parcelado_percentual','10')
assert.deepEqual(condicoesAcordoPayload(outraAba), { despesas_acordo_parcelado_percentual: 10 })
console.log('Percentuais, casas decimais, zero e preservação ao salvar outra aba conferidos.')
