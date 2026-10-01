import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registrarPerformanceFlow } from '../features/flows/performance'

test('métricas são opt-in e registram somente volumes, tempos e filtros booleanos', () => {
  const originalFlag = process.env.LOG_FLOW_PERFORMANCE
  const originalInfo = console.info
  const logs: string[] = []
  console.info = value => { logs.push(String(value)) }
  const metrics = {
    area: 'gerar' as const, inicio: Date.now(), canal: 'email',
    filtradoPorCarteira: true, filtradoPorCondominio: false, consultadas: 100, retornadas: 0,
    carteiraId: 'nao-registrar-id', email: 'nao-registrar-contato', payload: 'nao-registrar-conteudo',
  }
  try {
    delete process.env.LOG_FLOW_PERFORMANCE
    registrarPerformanceFlow(metrics)
    assert.equal(logs.length, 0)
    process.env.LOG_FLOW_PERFORMANCE = 'true'
    registrarPerformanceFlow(metrics)
    assert.equal(logs.length, 1)
    assert.ok(!logs[0].includes('nao-registrar'))
    const log = JSON.parse(logs[0])
    assert.deepEqual(Object.keys(log), ['event', 'area', 'duration_ms', 'canal', 'filtered_by_carteira', 'filtered_by_condominio', 'scanned_rows', 'returned_rows'])
    assert.equal(log.scanned_rows, 100)
    assert.equal(log.returned_rows, 0)
    assert.ok(log.duration_ms >= 0)
  } finally {
    console.info = originalInfo
    if (originalFlag === undefined) delete process.env.LOG_FLOW_PERFORMANCE
    else process.env.LOG_FLOW_PERFORMANCE = originalFlag
  }
})
