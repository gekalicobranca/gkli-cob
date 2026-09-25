import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COBRANCAS_FLOW_PAGE_SIZE, getFlowCobrancaPageData, searchFlowCondominios } from '../features/flows/cobranca/queries'

const scope = { userId: 'teste', perfil: 'operador', isAdmin: false, carteiraIds: ['permitida'] }

test('tela limita cobranças no banco; páginas não se repetem e exportação permanece completa', async () => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://performance-test.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  const requests: URL[] = []
  let transferredRows = 0
  globalThis.fetch = async input => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    requests.push(url)
    const table = url.pathname.split('/').pop()
    if (table === 'reguas') return Response.json([{ id: 'regua', nome: 'Régua', carteira_id: null, ativo: true }])
    if (table === 'regua_etapas') return Response.json([{ regua_id: 'regua', canal: 'email', ativo: true }])
    if (table === 'cobrancas') {
      const novo = url.searchParams.get('or')?.includes('.novo')
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? 500)
      assert.equal(url.searchParams.get('carteira_id'), 'in.(permitida)')
      assert.equal(url.searchParams.get('duplicada_de_id'), 'is.null')
      const rows = Array.from({ length: Math.max(0, Math.min(limit, 1205 - offset)) }, (_, i) => ({
        id: `${novo ? 'nova' : 'ativa'}-${offset + i}`, carteira_id: 'permitida', condominio_id: 'condominio',
        status_operacional: novo ? 'novo' : 'em_cobranca_ativa',
        unidade: { responsavel_nome: (offset + i) % 2 ? '' : 'Responsável' },
      }))
      transferredRows += rows.length
      return Response.json(rows)
    }
    if (table === 'maestro_flow_montagens' || table === 'lote_itens' || table === 'mensagens') return Response.json([])
    if (table === 'condominios') return Response.json([])
    throw new Error(`Consulta inesperada: ${table}`)
  }
  try {
    const full = await getFlowCobrancaPageData(scope, { canal: 'email' })
    const baseline = { queries: requests.length, rows: transferredRows }
    requests.length = 0
    transferredRows = 0
    const first = await getFlowCobrancaPageData(scope, { canal: 'email' }, { page: 1 })
    assert.equal(first.hasNext, true)
    assert.equal(first.painel.length, 50)
    assert.equal(first.disponibilidade.length, 50)
    assert.equal(transferredRows, (COBRANCAS_FLOW_PAGE_SIZE + 1) * 2)
    assert.ok(requests.length < baseline.queries)
    const montageQuery = requests.find(url => url.pathname.endsWith('/maestro_flow_montagens'))!
    assert.equal(montageQuery.searchParams.get('condominio_id'), 'in.(condominio)')
    console.log(`Carga sintética: ${baseline.queries} → ${requests.length} consultas; ${baseline.rows} → ${transferredRows} cobranças transferidas.`)
    const second = await getFlowCobrancaPageData(scope, { canal: 'email' }, { page: 2 })
    assert.ok(second.painel.every(row => !first.painel.some(prior => prior.id === row.id)))
    const last = await getFlowCobrancaPageData(scope, { canal: 'email' }, { page: 13 })
    assert.equal(last.hasNext, false)
    const exportData = await getFlowCobrancaPageData(scope, { canal: 'email' }, { somenteSaneamento: true })
    assert.equal(exportData.saneamento.length, 1204)
    assert.equal(exportData.saneamento.length, full.saneamento.length)
    requests.length = 0
    await searchFlowCondominios(scope, { term: 'a' })
    assert.equal(requests.length, 0)
    await searchFlowCondominios(scope, { term: 'jardim', carteiraId: 'permitida' })
    assert.equal(requests.length, 1)
    assert.equal(requests[0].searchParams.get('limit'), '30')
    assert.deepEqual(requests[0].searchParams.getAll('carteira_id'), ['in.(permitida)', 'eq.permitida'])
  } finally {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
  }
})
