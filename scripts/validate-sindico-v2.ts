import assert from 'node:assert/strict'
import { condominiosPermitidos, selecionarCondominio, type VinculoSindico } from '../features/sindico-v2/acesso'
import { resolverPeriodo, ultimaCompetenciaFechada } from '../features/sindico-v2/periodos'

// Meia-noite em São Paulo, e não meia-noite UTC, fecha a competência.
assert.equal(ultimaCompetenciaFechada(new Date('2026-09-10T02:59:59Z')), '2026-08')
assert.equal(ultimaCompetenciaFechada(new Date('2026-09-10T03:00:00Z')), '2026-09')
assert.equal(ultimaCompetenciaFechada(new Date('2027-01-09T15:00:00Z')), '2026-12')
assert.equal(ultimaCompetenciaFechada(new Date('2027-01-10T03:00:00Z')), '2027-01')

const agora = new Date('2026-09-07T15:00:00Z')
const padrao = resolverPeriodo({}, agora)
assert.equal(padrao.inicio, '2026-07-10')
assert.equal(padrao.fimExclusivo, '2026-08-10')
for (const invalida of ['2026-09', '2026-13', '2026-00', '2026-8', 'lixo', '1899-12']) {
  assert.equal(resolverPeriodo({ competencia: invalida }, agora).competencia, '2026-08')
}
const janeiro = resolverPeriodo({ competencia: '2026-01' }, agora)
assert.equal(janeiro.inicio, '2025-12-10')
assert.equal(janeiro.fimExclusivo, '2026-01-10')
const anual = resolverPeriodo({ modo: 'anual', ano: '2026' }, agora)
assert.equal(anual.competencias.length, 8)
assert.equal(anual.inicio, '2025-12-10')
assert.equal(anual.fimExclusivo, padrao.fimExclusivo)
const passado = resolverPeriodo({ modo: 'anual', ano: '2025' }, agora)
assert.equal(passado.competencias.length, 12)
assert.equal(passado.inicio, '2024-12-10')
assert.equal(passado.fimExclusivo, '2025-12-10')
assert.equal(resolverPeriodo({ modo: 'anual', ano: '2027' }, agora).ano, 2026)
assert.equal(resolverPeriodo({ modo: 'anual' }, new Date('2027-01-05T15:00:00Z')).ano, 2026)
for (const competencia of passado.competencias.slice(1)) {
  const atual = resolverPeriodo({ competencia }, agora)
  const anterior = resolverPeriodo({ competencia: atual.inicio.slice(0, 7) }, agora)
  assert.equal(anterior.fimExclusivo, atual.inicio, 'Ciclos consecutivos não podem sobrepor ou deixar lacunas')
}

const vinculos: VinculoSindico[] = [
  { condominio_id: 'a', status: 'ativo', condominios: { id: 'a', nome: 'Alameda' } },
  { condominio_id: 'a', status: 'ativo', condominios: [{ id: 'a', nome: 'Alameda' }] },
  { condominio_id: 'b', status: 'inativo', condominios: { id: 'b', nome: 'Bosque' } },
  { condominio_id: 'c', status: 'ativo', condominios: null },
  { condominio_id: 'd', status: 'ativo', condominios: { id: 'outro', nome: 'Divergente' } },
]
for (const status of ['inativo', 'pendente', '']) assert.deepEqual(condominiosPermitidos(status, vinculos), [])
const permitidos = condominiosPermitidos('ativo', vinculos)
assert.deepEqual(permitidos, [{ id: 'a', nome: 'Alameda' }])
assert.equal(selecionarCondominio(permitidos, 'b'), null)
assert.equal(selecionarCondominio(permitidos, 'outro'), null)
assert.equal(selecionarCondominio(permitidos)?.id, 'a')
assert.equal(selecionarCondominio([], 'a'), null)
console.log('Visão do síndico v2: competências, fronteiras de período e seleção autorizada validadas.')
