import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkAcordosStatus } from '../features/acordos/status-service'
import { dataOperacionalAcordos, diasAtrasoAcordo, classificarPrazoAcordo } from '../features/acordos/atraso-calendario'

test('calendário usa São Paulo sem depender do fuso do servidor', () => {
  assert.equal(dataOperacionalAcordos(new Date('2026-10-21T01:30:00Z')), '2026-10-20')
  assert.equal(diasAtrasoAcordo('2026-10-13', '2026-10-20'), 7)
  assert.equal(diasAtrasoAcordo('2026-10-14', '2026-10-20'), 6)
})

test('em dia entra em atraso/quebra; pagamentos, contratos e acordos encerrados são preservados', async () => {
  const hoje = dataOperacionalAcordos()
  const dia = (dias: number) => new Date(Date.parse(`${hoje}T00:00:00Z`) - dias * 86400000).toISOString().slice(0, 10)
  const statuses = ['em_dia', 'em_dia', 'quitado', 'cancelado', 'renegociado', 'quebrado', 'em_dia', 'em_dia', 'em_dia']
  const tables: Record<string, any[]> = {
    acordos: statuses.map((status, i) => ({ id: String(i), status, status_financeiro: 'em_aberto', valor_acordado: 718.2, entrada: 0, unidade_id: null, cobranca_id: null })),
    parcelas_acordo: statuses.map((_, i) => ({ id: `p${i}`, acordo_id: String(i), status: i === 6 ? 'paga' : 'aberta', vencimento: dia(i === 0 ? 15 : 30), data_pagamento: i === 6 || i === 7 ? dia(2) : null, valor: 718.2 })),
    acordo_cobrancas: [],
  }
  const before = structuredClone(tables)
  const db = { from(table: string) {
    let patch: any
    let faixa: [number, number] | undefined
    const filters: ((row: any) => boolean)[] = []
    const query: any = {
      select() { return query },
      order() { return query },
      range(inicio: number, fim: number) { faixa = [inicio, fim]; return query },
      update(value: any) { patch = value; return query },
      eq(key: string, value: any) { filters.push(row => row[key] === value); return query },
      is(key: string, value: any) { filters.push(row => (row[key] ?? null) === value); return query },
      in(key: string, values: any[]) { filters.push(row => values.includes(row[key])); return query },
      lt(key: string, value: any) { filters.push(row => row[key] < value); return query },
      then(resolve: any, reject: any) {
        let rows = tables[table].filter(row => filters.every(f => f(row)))
        if (faixa) rows = rows.slice(faixa[0], faixa[1] + 1)
        if (patch) rows.forEach(row => Object.assign(row, patch))
        return Promise.resolve({ data: structuredClone(rows), error: null, count: rows.length }).then(resolve, reject)
      },
    }
    return query
  } }
  const deps = { createAdminClient: () => db as any, registrarEventoOperacional: async () => undefined as any }
  const options = { acordoIds: statuses.map((_, i) => String(i)).filter(id => id !== '8') }
  const result = await checkAcordosStatus(options, deps)
  assert.equal(result.acordosMarcadosEmAtraso, 1)
  assert.equal(result.acordosRompidos, 1)
  assert.equal(tables.acordos[0].status, 'em_atraso')
  assert.equal(tables.acordos[1].status, 'quebrado')
  assert.equal(result.acordosQuitados, 2)
  for (const i of [6, 7]) {
    assert.equal(tables.acordos[i].status, 'quitado')
    assert.equal(tables.acordos[i].status_financeiro, 'quitado')
    assert.equal(tables.acordos[i].data_quitacao, dia(2))
  }
  for (const i of [2, 3, 4, 5, 8]) assert.deepEqual(tables.acordos[i], before.acordos[i])
  for (const i of [6, 7, 8]) assert.deepEqual(tables.parcelas_acordo[i], before.parcelas_acordo[i])
  for (let i = 0; i < statuses.length; i++) {
    assert.equal(tables.acordos[i].valor_acordado, before.acordos[i].valor_acordado)
    assert.equal(tables.parcelas_acordo[i].valor, before.parcelas_acordo[i].valor)
    assert.equal(tables.parcelas_acordo[i].data_pagamento, before.parcelas_acordo[i].data_pagamento)
  }
  const repeat = await checkAcordosStatus(options, deps)
  assert.equal(repeat.acordosMarcadosEmAtraso, 0)
  assert.equal(repeat.acordosRompidos, 0)
  assert.equal(repeat.acordosQuitados, 0)
})

test('parcela do período paga é em dia; quitação exige todas pagas e cobertura do contrato em centavos', () => {
  const hoje = '2026-10-20'
  const paga = { vencimento: '2026-10-10', status: 'paga', data_pagamento: '2026-10-09', valor: 100 }
  const futura = { vencimento: '2026-11-10', status: 'aberta', valor: 100 }
  assert.equal(classificarPrazoAcordo([paga, futura], hoje, 15, 30, 200), 'em_dia')
  assert.equal(classificarPrazoAcordo([paga], hoje, 15, 30, 100), 'quitado')
  assert.equal(classificarPrazoAcordo([paga], hoje, 15, 30, 100.01), 'em_dia', 'um centavo pendente impede quitação')
  assert.equal(classificarPrazoAcordo([paga, futura], hoje, 15, 30, 100), 'em_dia', 'cobrir contrato não dispensa parcela aberta')
  assert.equal(classificarPrazoAcordo([paga, { ...futura, status: 'cancelada' }], hoje, 15, 30, 200), 'em_dia')
  assert.equal(classificarPrazoAcordo([], hoje, 15, 30, 100), null)
  assert.notEqual(classificarPrazoAcordo([{...paga, valor: undefined}], hoje, 15, 30, 100), 'quitado')
  assert.notEqual(classificarPrazoAcordo([paga], hoje), 'quitado', 'sem valor contratado não há prova de saldo zero')
  assert.equal(classificarPrazoAcordo([{...paga, valor: 0.1}, {...paga, valor: 0.2}], hoje, 15, 30, 0.3), 'quitado')
  assert.equal(classificarPrazoAcordo([{ ...paga, vencimento: '2026-09-10', status: 'aberta', data_pagamento: null }, paga, futura], hoje, 15, 30, 300), 'quebrado', 'pagamento do período não oculta parcela anterior vencida')
})

test('limites D+14, D+15, D+29 e D+30 e condição de em dia', () => {
  const hoje = '2026-10-20'
  const parcela = (dias: number) => ({ vencimento: new Date(Date.parse(`${hoje}T00:00:00Z`) - dias * 86400000).toISOString().slice(0, 10), status: 'aberta' })
  for (const dias of [1, 7, 14]) assert.equal(classificarPrazoAcordo([parcela(dias)], hoje), 'ativo')
  for (const dias of [15, 29]) assert.equal(classificarPrazoAcordo([parcela(dias)], hoje), 'em_atraso')
  for (const dias of [30, 40]) assert.equal(classificarPrazoAcordo([parcela(dias)], hoje), 'quebrado')
  assert.equal(classificarPrazoAcordo([parcela(-10)], hoje), 'ativo', 'primeira parcela ainda não paga não significa em dia')
  assert.equal(classificarPrazoAcordo([{...parcela(20),status:'paga'}, parcela(-10)], hoje), 'em_dia')
  assert.equal(classificarPrazoAcordo([{...parcela(20),status:'paga'}, parcela(0)], hoje), 'em_dia', 'dia do vencimento ainda não é atraso')
  assert.equal(classificarPrazoAcordo([{...parcela(40),status:'paga'}, parcela(14)], hoje), 'ativo')
  assert.equal(classificarPrazoAcordo([parcela(40), parcela(-10)], hoje), 'quebrado', 'parcela futura não esconde dívida antiga')
})
