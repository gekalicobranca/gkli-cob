import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aplicarFiltroCriacao, criadoNoIntervalo, dataFiltroCriacao } from '../lib/core/filtros-criacao'
import { operadorResponsavelId } from '../lib/core/operador-responsavel'
import { aplicarFiltroOperador } from '../features/cadastros/filtro-operador'
import { filterRows } from '../features/acordos/parcelas-fila'

test('criação inclui todo o dia em Brasília e aplica os mesmos limites no banco', () => {
  const de = '2026-10-21', ate = '2026-10-21'
  for (const [timestamp, expected] of [
    ['2026-10-21T02:59:59.999Z', false], ['2026-10-21T03:00:00Z', true],
    ['2026-10-22T02:59:59.999Z', true], ['2026-10-22T03:00:00Z', false],
  ] as const) assert.equal(criadoNoIntervalo(timestamp, de, ate), expected)
  assert.equal(criadoNoIntervalo(null, de, ate), false)
  assert.equal(criadoNoIntervalo(null), true)
  assert.equal(dataFiltroCriacao('2026-02-30'), '')
  const calls: unknown[] = []
  const query = { gte(...args: unknown[]) { calls.push(['gte', ...args]); return query }, lt(...args: unknown[]) { calls.push(['lt', ...args]); return query } }
  aplicarFiltroCriacao(query, de, ate)
  assert.deepEqual(calls, [['gte', 'created_at', '2026-10-21T00:00:00-03:00'], ['lt', 'created_at', '2026-10-22T00:00:00-03:00']])
})

test('operador próprio prevalece sobre condomínio e carteira', () => {
  assert.equal(operadorResponsavelId({ operador_id: 'own', condominios: { operador_id: 'condo' }, carteiras: { operador_id: 'wallet' } }), 'own')
  assert.equal(operadorResponsavelId({ condominios: { operador_id: 'condo' }, carteiras: { operador_id: 'wallet' } }), 'condo')
  assert.equal(operadorResponsavelId({ carteiras: { operador_id: 'wallet' } }), 'wallet')
  assert.equal(operadorResponsavelId({}), null)
})

test('parcelas combinam operador, criação da parcela e vencimento sem usar criação do acordo', () => {
  const base = { vencimento: '2026-11-10', created_at: '2026-10-22T02:59:59Z', acordo: { created_at: '2025-01-01', condominios: { operador_id: 'a' } } }
  const rows = [{ ...base, id: 'ok' }, { ...base, id: 'operator', acordo: { operador_id: 'b' } }, { ...base, id: 'date', created_at: '2026-10-22T03:00:00Z' }]
  assert.deepEqual(filterRows(rows, { operador_id: 'a', criacao_de: '2026-10-21', criacao_ate: '2026-10-21', vencimento_de: '2026-11-01' }).map(row => row.id), ['ok'])
})

test('filtro SQL respeita escopo e herança e retorna builder sem executar a consulta principal', async () => {
  const id = '11111111-1111-1111-1111-111111111111', calls: string[] = []
  const db = { from(table: string) {
    const q: any = { select() { return q }, order() { return q }, range() { return q }, in(column: string, values: string[]) { calls.push(`${table}:${column}:${values}`); return q }, eq() { return q }, then(resolve: any) {
      return Promise.resolve({ data: table === 'condominios' ? [
        { id: 'own', operador_id: id, carteiras: { operador_id: 'other' } },
        { id: 'inherited', operador_id: null, carteiras: { operador_id: id } },
        { id: 'different', operador_id: 'other', carteiras: { operador_id: id } },
      ] : [{ id: 'wallet' }], error: null }).then(resolve)
    } }; return q
  } }
  let expression = ''
  const query: any = { or(value: string) { expression = value; return query }, then() { throw new Error('Consulta principal executada antes de completar os filtros') } }
  const { query: result } = await aplicarFiltroOperador(query, db as any, { carteiraIds: ['allowed'] } as any, id)
  assert.equal(result, query)
  assert.ok(expression.includes('condominio_id.in.(own,inherited)'))
  assert.ok(!expression.includes('different'))
  assert.ok(expression.includes('operador_id.is.null,condominio_id.is.null,carteira_id.in.(wallet)'))
  assert.deepEqual(calls, ['condominios:carteira_id:allowed', 'carteiras:id:allowed'])
})
