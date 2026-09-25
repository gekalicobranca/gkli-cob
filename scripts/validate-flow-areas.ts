import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getFlowCobrancaMonitorData, FLOWS_PAGE_SIZE } from '../features/flows/cobranca/queries'
import { canalFlowCobranca, flowCobrancaAba, flowCobrancaPagina, flowCobrancaPath, flowCobrancaStatus, flowCobrancaTabQuery } from '../features/flows/cobranca/rotas'

test('troca de abas preserva apenas filtros com o mesmo significado e reinicia a página', () => {
  const query = 'canal=email&carteira=a&condominio=b&inclusao_de=2026-09-01&inclusao_ate=2026-09-24&vencimento_de=2026-08-01&ordenar=agenda_asc&status=pronto&pagina=3&selecionadas=antiga'
  const same = new URLSearchParams(flowCobrancaTabQuery(query, 'flows', 'flows'))
  assert.equal(same.get('status'), 'pronto')
  assert.equal(same.get('pagina'), null)
  assert.equal(same.get('selecionadas'), null)
  const history = new URLSearchParams(flowCobrancaTabQuery(query, 'flows', 'historico'))
  assert.equal(history.get('inclusao_de'), '2026-09-01')
  assert.equal(history.get('ordenar'), 'agenda_asc')
  assert.equal(history.get('status'), null)
  assert.equal(history.get('vencimento_de'), null)
  const saneamento = new URLSearchParams(flowCobrancaTabQuery(query, 'gerar', 'saneamento'))
  assert.equal(saneamento.get('vencimento_de'), '2026-08-01')
  assert.equal(saneamento.get('inclusao_ate'), '2026-09-24')
  assert.equal(saneamento.get('ordenar'), null)
  for (const [origem, destino] of [['flows', 'gerar'], ['gerar', 'flows'], ['flows', 'maestro'], ['maestro', 'flows']] as const) {
    assert.deepEqual(Object.fromEntries(new URLSearchParams(flowCobrancaTabQuery(query, origem, destino))), {
      aba: destino, canal: 'email', carteira: 'a', condominio: 'b',
    })
  }
})

test('status só é aceito na área correspondente', () => {
  assert.equal(flowCobrancaStatus('pronto', 'flows'), 'pronto')
  assert.equal(flowCobrancaStatus('cancelado', 'historico'), 'cancelado')
  assert.equal(flowCobrancaStatus('cancelado', 'flows'), undefined)
  assert.equal(flowCobrancaStatus('pronto', 'historico'), undefined)
  assert.equal(flowCobrancaStatus('pronto', 'gerar'), undefined)
  assert.equal(flowCobrancaStatus('inexistente', 'flows'), undefined)
})

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
      id: `flow-${index}`, status: 'pronto', condominio_id: 'condominio', flow_canais: [],
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
    requests.length = 0
    await getFlowCobrancaMonitorData(scope, {
      canal: 'email', carteiraId: 'permitida', condominioId: 'condominio',
      inclusaoDe: '2026-09-01', inclusaoAte: '2026-09-24',
    }, { page: 1, historico: false, status: 'pausado', ordenar: 'agenda_asc' })
    const filtered = requests[0].searchParams
    assert.deepEqual(filtered.getAll('carteira_id'), ['in.(permitida)', 'eq.permitida'])
    assert.equal(filtered.get('payload->>condominio_id'), 'eq.condominio')
    assert.deepEqual(filtered.getAll('created_at'), ['gte.2026-09-01T00:00:00-03:00', 'lte.2026-09-24T23:59:59.999999-03:00'])
    assert.deepEqual(filtered.getAll('status'), ['in.(pronto,em_execucao,pausado)', 'eq.pausado'])
    assert.match(filtered.get('order') ?? '', /^proximo_disparo_em.asc.nullslast,created_at.desc,id.asc$/)
  } finally {
    globalThis.fetch = previousFetch
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey
  }
})
