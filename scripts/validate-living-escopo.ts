import assert from 'node:assert/strict'
import { escopoLiving } from '../features/importacoes/living-escopo'
import { LIVING_SEGMENTOS } from './agente-automatico/living-segmentos.mjs'
const id = 'cb988811-e0ea-45d6-990b-6476271eb109'
const buffer = (manifest: unknown) => Buffer.from(`<!--GKLI_LIVING:${Buffer.from(JSON.stringify(manifest)).toString('base64')}-->`)
assert.deepEqual(escopoLiving(buffer(LIVING_SEGMENTOS), id)?.escopoBlocosMaestro, ['A', 'B', 'C', 'LJ'])
assert.throws(() => escopoLiving(Buffer.from('Central sem pendências'), id), /exige coleta/)
assert.throws(() => escopoLiving(buffer(LIVING_SEGMENTOS.slice(1)), id), /incompleto/)
assert.throws(() => escopoLiving(buffer(LIVING_SEGMENTOS.map(s => ({ ...s, blocos: ['OUTRO'] }))), id), /inválido/)
assert.equal(escopoLiving(Buffer.from('Outro condomínio'), 'outro'), null)
console.log('Escopo validado: segmentos completos, blocos corretos e rejeição de coleta parcial.')
