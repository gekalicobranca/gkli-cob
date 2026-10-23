import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkAcordosStatus } from '../features/acordos/status-service'

test('pausa explícita de conciliação preserva parcelas e acordo; pausas comuns e encerradas não congelam apuração', async () => {
  const ids = ['pendente', 'comum', 'expirada', 'inativa', 'pago_em_conciliacao']
  const tables: Record<string, any[]> = {
    fechamento_periodos: [],
    regua_pausas: ids.map(id => ({ id, acordo_id: id, ativo: id !== 'inativa', pausa_ate: id === 'expirada' ? '2000-01-01' : null,
      payload: id === 'comum' ? {} : { conciliacao_pagamentos_pendente: true } })),
    acordos: ids.map(id => ({ id, status: 'ativo', status_financeiro: 'parcial', valor_acordado: 100, unidade_id: null, cobranca_id: null })),
    parcelas_acordo: ids.map(id => ({ id: `p-${id}`, acordo_id: id, numero: 1, vencimento: '2000-01-01', valor: 100,
      status: id === 'pago_em_conciliacao' ? 'paga' : 'aberta', data_pagamento: id === 'pago_em_conciliacao' ? '2000-01-01' : null })),
    acordo_cobrancas: [],
  }
  const before = structuredClone(tables)
  let writes = 0
  const db = { from(table: string) {
    let patch: any, single = false
    let range: [number, number] | undefined
    const filters: ((r: any) => boolean)[] = []
    const value = (r: any, k: string) => k === 'payload->>conciliacao_pagamentos_pendente' ? String(r.payload?.conciliacao_pagamentos_pendente) : r[k]
    const q: any = {
      select() { return q }, order() { return q }, limit() { return q }, maybeSingle() { single = true; return q },
      range(start: number, end: number) { range = [start, end]; return q },
      update(p: any) { patch = p; return q },
      eq(k: string, v: any) { filters.push(r => value(r, k) === v); return q },
      neq(k: string, v: any) { filters.push(r => r[k] !== v); return q },
      in(k: string, v: any[]) { filters.push(r => v.includes(r[k])); return q },
      lt(k: string, v: any) { filters.push(r => r[k] < v); return q },
      lte(k: string, v: any) { filters.push(r => r[k] <= v); return q },
      gte(k: string, v: any) { filters.push(r => r[k] >= v); return q },
      is(k: string, v: any) { filters.push(r => (r[k] ?? null) === v); return q },
      then(resolve: any, reject: any) {
        let rows = tables[table].filter(r => filters.every(f => f(r)))
        if (range) rows = rows.slice(range[0], range[1] + 1)
        if (patch) { writes += rows.length; rows.forEach(r => Object.assign(r, patch)) }
        return Promise.resolve({ data: structuredClone(single ? rows[0] ?? null : rows), count: rows.length, error: null }).then(resolve, reject)
      },
    }
    return q
  } }
  const result = await checkAcordosStatus({}, { createAdminClient: () => db as any, registrarEventoOperacional: async () => undefined as any })
  assert.equal(result.acordosRompidos, 3)
  assert.equal(result.acordosQuitados, 0)
  for (const id of ['pendente', 'pago_em_conciliacao']) {
    assert.deepEqual(tables.acordos.find(a => a.id === id), before.acordos.find(a => a.id === id))
    assert.deepEqual(tables.parcelas_acordo.find(p => p.acordo_id === id), before.parcelas_acordo.find(p => p.acordo_id === id))
  }
  assert(writes > 0)
})

test('falha ao carregar pausas impede qualquer alteração financeira', async () => {
  let writes = 0
  const db = { from(table: string) {
    const q: any = { select() { return q }, neq() { return q }, lte() { return q }, gte() { return q }, order() { return q }, limit() { return q }, maybeSingle() { return q }, eq() { return q }, range() { return q },
      update() { writes++; return q }, then(resolve: any) { return Promise.resolve(resolve({ data: null, error: table === 'regua_pausas' ? { message: 'indisponível' } : null })) } }
    return q
  } }
  await assert.rejects(checkAcordosStatus({}, { createAdminClient: () => db as any, registrarEventoOperacional: async () => undefined as any }), /pausas de conciliação/)
  assert.equal(writes, 0)
})
