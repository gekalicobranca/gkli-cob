import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COBRANCAS_FLOW_PAGE_SIZE, getFlowCobrancaPageData, searchFlowCondominios } from '../features/flows/cobranca/queries'

const scope = { userId: 'teste', perfil: 'operador', isAdmin: false, carteiraIds: ['permitida'] }

test('gerar flows pagina elegíveis após vínculos e saneamento, conta o total e preserva canais e escopo', async () => {
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
    if (table === 'liberar_cobrancas_regulares') return Response.json(0)
    if (table === 'reguas') return Response.json(['email', 'whatsapp'].map(canal => ({ id: canal, nome: canal, carteira_id: null, ativo: true })))
    if (table === 'regua_etapas') return Response.json(['email', 'whatsapp'].map(canal => ({ regua_id: canal, canal, ativo: true })))
    if (table === 'cobrancas') {
      const novo = url.searchParams.get('or')?.includes('.novo')
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? 500)
      assert.equal(url.searchParams.get('carteira_id'), 'in.(permitida)')
      assert.equal(url.searchParams.get('duplicada_de_id'), 'is.null')
      assert.equal(url.searchParams.get('order'), 'vencimento.asc,id.asc')
      const rows = Array.from({ length: Math.max(0, Math.min(limit, 1207 - offset)) }, (_, i) => ({
        id: `${novo ? 'nova' : 'ativa'}-${offset + i}`, carteira_id: 'permitida', condominio_id: 'condominio', unidade_id: `unidade-${offset + i}`, valor_original: 10,
        // As duas últimas simulam status Novo/Ativa incorreto antes do D+ e vencimento ausente.
        vencimento: offset + i === 1206 ? null : offset + i === 1205 ? '2099-01-01' : '2020-01-01',
        condominio: { dias_apos_vencimento_regua: 30 },
        status_operacional: novo ? 'novo' : 'em_cobranca_ativa',
        unidade: { responsavel_nome: (offset + i) % 2 ? '' : 'Responsável', email: 'teste@example.invalid', telefone: '11999999999' },
      }))
      transferredRows += rows.length
      return Response.json(rows)
    }
    if (table === 'lote_itens' || table === 'mensagens') {
      if (url.searchParams.has('fingerprint')) {
        const fingerprints = url.searchParams.get('fingerprint')!.slice(4,-1).split(',')
        return Response.json(table === 'mensagens' ? fingerprints.filter(key => key.includes('-1202:') && key.includes(':email:')).map(fingerprint=>({fingerprint})) : [])
      }
      if (table === 'mensagens' && url.searchParams.has('cobranca.unidade_id')) {
        assert.equal(url.searchParams.get('carteira_id'), 'eq.permitida')
        assert.equal(url.searchParams.get('flow.status'), 'neq.cancelado')
        const unidades = url.searchParams.get('cobranca.unidade_id')!
        return Response.json(unidades.includes('unidade-1204') ? [{ id: 'email-anterior',
          cobranca: { unidade_id: 'unidade-1204' }, flow: { regua_id: 'email', status: 'pronto' },
        }] : [])
      }
      if (table === 'mensagens' && url.searchParams.has('carteira_id')) {
        assert.equal(url.searchParams.get('carteira_id'), 'in.(permitida)')
        assert.equal(url.searchParams.get('limit'), '500')
        return Response.json([{ id: 'orfa', cobranca_id: 'ativa-206', canal: 'email' }, { id: 'fora-recorte', cobranca_id: 'outra', canal: 'email' }])
      }
      const ids = (url.searchParams.get('cobranca_id') ?? '').slice(4, -1).split(',')
      assert.ok(ids.every(id => Number(id.split('-')[1]) % 2 === 0), 'não consulta vínculos de cobranças sem responsável')
      if (table === 'lote_itens') {
        assert.ok(url.searchParams.get('select')?.includes('canais:payload->canais'))
        assert.ok(!url.searchParams.get('select')?.includes('(payload,'))
      }
      return Response.json(ids.filter(id => table === 'lote_itens' ? Number(id.split('-')[1]) < 205 : id === 'ativa-206').map(id => ({
        id: `vinculo-${id}`, cobranca_id: id, canal: 'email',
        flow: { canais: ['email'] },
      })))
    }
    if (table === 'maestro_flow_montagens' || table === 'regua_pausas') return Response.json([])
    if (table === 'responsaveis_unidades' || table === 'flow_saneamento_dispensas') return Response.json([])
    if (table === 'condominios') return Response.json([])
    throw new Error(`Consulta inesperada: ${table}`)
  }
  try {
    const full = await getFlowCobrancaPageData(scope, { canal: 'email' })
    requests.length = 0
    transferredRows = 0
    const first = await getFlowCobrancaPageData(scope, { canal: 'email' }, { page: 1 })
    assert.equal(first.hasNext, true)
    assert.equal(first.painel.length, COBRANCAS_FLOW_PAGE_SIZE)
    assert.equal(first.disponibilidade.length, COBRANCAS_FLOW_PAGE_SIZE)
    assert.equal(first.disponibilidade[0].id, 'ativa-208')
    assert.equal(first.totalDisponibilidade, 497)
    assert.equal(first.totalPainel, 601)
    assert.equal(first.valorPainel, 6010)
    assert.equal(first.unidadesPainel, 601)
    assert.ok(full.disponibilidade.every(row => row.unidade_id !== 'unidade-1204'))
    assert.ok(full.disponibilidade.every(row => row.id !== 'ativa-1202'))
    assert.equal(requests.filter(url => url.pathname.endsWith('/mensagens') && !url.searchParams.has('cobranca.unidade_id') && !url.searchParams.has('fingerprint')).length, 1)
    assert.equal(transferredRows, 2414)
    assert.ok(requests.filter(url => url.pathname.endsWith('/cobrancas')).every(url => Number(url.searchParams.get('limit')) <= 500))
    const montageQuery = requests.find(url => url.pathname.endsWith('/maestro_flow_montagens'))!
    assert.equal(montageQuery.searchParams.get('condominio_id'), 'in.(condominio)')
    const second = await getFlowCobrancaPageData(scope, { canal: 'email' }, { page: 2 })
    assert.ok(second.painel.every(row => !first.painel.some(prior => prior.id === row.id)))
    assert.ok(second.disponibilidade.every(row => !first.disponibilidade.some(prior => prior.id === row.id)))
    assert.equal(second.totalDisponibilidade, first.totalDisponibilidade)
    const allPages = [...first.disponibilidade, ...second.disponibilidade]
    for (const page of [3, 4, 5]) allPages.push(...(await getFlowCobrancaPageData(scope, { canal: 'email' }, { page })).disponibilidade)
    assert.deepEqual(allPages.map(row => row.id), full.disponibilidade.map(row => row.id))
    const last = await getFlowCobrancaPageData(scope, { canal: 'email' }, { page: 7 })
    assert.equal(last.hasNext, false)
    assert.equal(last.painel.length, 1)
    assert.equal(last.disponibilidade.length, 0)
    const whatsapp = await getFlowCobrancaPageData(scope, { canal: 'whatsapp' }, { page: 1 })
    assert.equal(whatsapp.totalDisponibilidade, 603)
    assert.equal(whatsapp.disponibilidade[0].id, 'ativa-0')
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
