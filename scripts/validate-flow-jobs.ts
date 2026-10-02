import assert from 'node:assert/strict'
import { test } from 'node:test'
import { flowBudgetFetch, withFlowBudget } from '../lib/jobs/flow-execution'
import { runFlowJob } from '../app/api/jobs/flows/_lib/run'
import { createAdminClient } from '../utils/supabase/admin'

test('clientes internos compartilham orçamento, respeitam abort e não afetam chamadas fora do job', async () => {
  const originalFetch = globalThis.fetch
  const originalNow = Date.now
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://flow-job-test.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  let calls = 0
  let lastSignal: AbortSignal | undefined | null
  globalThis.fetch = async (_input, init) => {
    calls++
    lastSignal = init?.signal
    return Response.json([])
  }
  try {
    assert.equal(flowBudgetFetch(), undefined)
    await withFlowBudget(async () => {
      await createAdminClient().from('cobrancas').select('id')
      await createAdminClient().from('mensagens').select('id')
      const scopedFetch = flowBudgetFetch()!
      for (let n = 0; n < 398; n++) await scopedFetch('https://flow-job-test.invalid')
      await assert.rejects(scopedFetch('https://flow-job-test.invalid'), /Limite de consultas/)
    })
    assert.equal(calls, 400, 'Clientes criados dentro de helpers usam o mesmo contador')
    await withFlowBudget(async () => {
      const canceled = new AbortController()
      canceled.abort()
      await flowBudgetFetch()!('https://flow-job-test.invalid', { signal: canceled.signal })
      assert.equal(lastSignal?.aborted, true)
      const now = Date.now()
      Date.now = () => now + 90_001
      await assert.rejects(flowBudgetFetch()!('https://flow-job-test.invalid'), /Tempo máximo/)
      Date.now = originalNow
    })
    assert.equal(flowBudgetFetch(), undefined)
  } finally {
    globalThis.fetch = originalFetch
    Date.now = originalNow
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
  }
})

test('rota falha fechada sem reserva e registra falhas retornadas ou lançadas para backoff', async () => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://flow-job-test.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  const completions: boolean[] = []
  let reservation: string | null = null
  let unavailable = false
  let worked = 0
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/flows_job_reservar')) {
      if (unavailable) return Response.json({ message: 'Unavailable', code: 'XX000' }, { status: 503 })
      return Response.json(reservation)
    }
    if (url.endsWith('/flows_job_concluir')) {
      completions.push(JSON.parse(String(init?.body)).p_sucesso)
      return Response.json(true)
    }
    throw new Error('Unexpected HTTP call')
  }
  try {
    let response = await runFlowJob('montar', async () => { worked++; return { processadas: 1 } })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).skipped, true)
    assert.equal(worked, 0)
    unavailable = true
    response = await runFlowJob('montar', async () => { worked++; return {} })
    assert.equal(response.status, 500)
    assert.equal(worked, 0, 'Falha no banco nunca libera execução desprotegida')
    unavailable = false
    reservation = '00000000-0000-0000-0000-000000000001'
    response = await runFlowJob('progredir', async () => ({ resultados: [{ status: 'atencao', erro: 'Falha no processamento' }] }))
    assert.equal(response.status, 500)
    assert.equal((await response.json()).ok, false)
    response = await runFlowJob('montar', async () => { throw new Error('Timeout') })
    assert.equal(response.status, 500)
    response = await runFlowJob('montar', async () => ({ processadas: 0 }))
    assert.equal(response.status, 200)
    assert.deepEqual(completions, [false, false, true])
  } finally {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
  }
})
