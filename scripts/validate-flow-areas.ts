import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getFlowCobrancaMonitorData, FLOWS_PAGE_SIZE } from '../features/flows/cobranca/queries'
import { canalFlowCobranca, flowCobrancaAba, flowCobrancaPagina, flowCobrancaPath } from '../features/flows/cobranca/rotas'

test('rotas e abas mantêm os canais separados e normalizam paginação inválida', () => {
  assert.equal(flowCobrancaPath(canalFlowCobranca('whatsapp')), '/app/flows/cobranca/whatsapp')
  assert.equal(flowCobrancaPath(canalFlowCobranca(undefined)), '/app/flows/cobranca/email')
  assert.equal(flowCobrancaAba('maestro', 'whatsapp'), 'flows')
  assert.equal(flowCobrancaAba('maestro', 'email'), 'maestro')
  assert.equal(flowCobrancaAba(undefined, 'email', 'lotes'), 'gerar')
  for (const value of [undefined, '-1', '0', '1.5', 'Infinity', 'abc']) assert.equal(flowCobrancaPagina(value), 1)
  assert.equal(flowCobrancaPagina('2'), 2)
})

test('monitor pagina no banco e não consulta cobranças, saneamento ou vínculos de mensagens', async () => {
  const previousFetch = globalThis.fetch
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://flows-test.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  const requests: URL[] = []
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    requests.push(url)
    if (url.pathname.endsWith('/condominios')) return Response.json([{ id: 'condominio', nome: 'Condomínio de teste' }])
    assert.ok(url.pathname.endsWith('/cobranca_flows'), `Consulta inesperada: ${url.pathname}`)
    const channel = url.searchParams.get('regua_canal.etapas.canal')?.slice(3)
    const rows = Array.from({ length: FLOWS_PAGE_SIZE + 1 }, (_, index) => ({
      id: `flow-${index}`, status: 'pronto', payload: { condominio_id: 'condominio' },
      [`canal_${channel}`]: [{ canal: channel }], regua: { nome: 'Régua', etapas: [] },
    }))
    return Response.json(rows)
  }
  try {
    const scope = { userId: 'operador', perfil: 'operador', isAdmin: false, carteiraIds: ['permitida'] }
    const result = await getFlowCobrancaMonitorData(scope, { canal: 'whatsapp' }, { page: 2, historico: false })
    assert.equal(result.flows.length, FLOWS_PAGE_SIZE)
    assert.equal(result.hasNext, true)
    assert.ok(result.flows.every(flow => flow.canais.includes('whatsapp')))
    assert.deepEqual(result.painel, [])
    assert.deepEqual(result.disponibilidade, [])
    assert.equal(requests.length, 2)
    const query = requests[0].searchParams
    assert.equal(query.get('offset'), String(FLOWS_PAGE_SIZE))
    assert.equal(query.get('limit'), String(FLOWS_PAGE_SIZE + 1))
    assert.equal(query.get('carteira_id'), 'in.(permitida)')
    assert.equal(query.get('status'), 'in.(pronto,em_execucao,pausado)')
    assert.ok(query.get('or')?.includes('canal_whatsapp.not.is.null'))
    assert.ok(query.get('or')?.includes('payload->canais.cs.["whatsapp"]'))
    for (const channel of ['email', 'whatsapp', 'manual']) assert.equal(query.get(`canal_${channel}.limit`), '1')
    assert.ok(!('canal_whatsapp' in result.flows[0]))
    requests.length = 0
    await getFlowCobrancaMonitorData(scope, { canal: 'email' }, { page: 1, historico: true })
    assert.equal(requests[0].searchParams.get('status'), 'in.(concluido,concluido_com_falhas,cancelado)')
  } finally {
    globalThis.fetch = previousFetch
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey
  }
})
