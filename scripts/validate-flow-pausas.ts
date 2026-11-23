import assert from 'node:assert/strict'
import { test } from 'node:test'
import { carregarPausasRegua, filtrarCobrancasSemPausa, pausaAbrangeContexto, type PausaRegua } from '../features/regua/services/pausa-escopo'
import { getFlowCobrancaPageData } from '../features/flows/cobranca/queries'

const agora = new Date('2026-11-22T12:00:00Z')
const ctx = { carteiraId: 'carteira', condominioId: 'condominio', unidadeId: 'u1', cobrancaId: 'c1', acordoId: 'a1' }
const pausa: PausaRegua = { id: 'pausa', carteira_id: 'carteira', condominio_id: 'condominio', unidade_id: 'u1', acordo_id: 'a1', ativo: true, motivo: 'Conciliação documental', pausa_ate: null }

test('pausa de unidade com condomínio e acordo preserva conciliação sem alcançar vizinhas', () => {
  assert.equal(pausaAbrangeContexto(pausa, ctx, agora), true)
  assert.equal(pausaAbrangeContexto(pausa, { ...ctx, unidadeId: 'u2', cobrancaId: 'c2', acordoId: 'a2' }, agora), false)
  assert.equal(pausaAbrangeContexto(pausa, { condominioId: 'condominio', carteiraId: 'carteira' }, agora), false)
  assert.equal(pausaAbrangeContexto(pausa, { ...ctx, carteiraId: 'outra' }, agora), false)
})

test('pausa específica de cota não se amplia; pausas genuínas de acordo e condomínio continuam válidas', () => {
  assert.equal(pausaAbrangeContexto({ ...pausa, cobranca_id: 'c1' }, { ...ctx, cobrancaId: 'c2' }, agora), false)
  assert.equal(pausaAbrangeContexto({ ...pausa, unidade_id: null }, { ...ctx, unidadeId: 'u2' }, agora), true)
  assert.equal(pausaAbrangeContexto({ ...pausa, unidade_id: null, acordo_id: null }, { ...ctx, unidadeId: 'u2', acordoId: null }, agora), true)
  assert.equal(pausaAbrangeContexto({ ...pausa, unidade_id: null, acordo_id: null, condominio_id: null }, ctx, agora), false)
})

test('pausas expiradas/inativas não bloqueiam e prazo final é inclusivo', () => {
  assert.equal(pausaAbrangeContexto({ ...pausa, ativo: false }, ctx, agora), false)
  assert.equal(pausaAbrangeContexto({ ...pausa, pausa_ate: '2026-11-22T11:59:59Z' }, ctx, agora), false)
  assert.equal(pausaAbrangeContexto({ ...pausa, pausa_ate: agora.toISOString() }, ctx, agora), true)
})

function dbMock(pausas: PausaRegua[], erro = false) {
  const chamadas: string[] = []
  return { chamadas, from(table: string) {
    assert.equal(table, 'regua_pausas')
    const filtros: ((row: any) => boolean)[] = []
    const q: any = {
      select: () => q, order: () => q,
      eq: (key: string, value: any) => { filtros.push(row => row[key] === value); return q },
      is: (key: string) => { filtros.push(row => row[key] == null); return q },
      or: () => { filtros.push(row => !row.pausa_ate || Date.parse(row.pausa_ate) >= agora.getTime()); return q },
      in: (key: string, ids: string[]) => { chamadas.push(key); filtros.push(row => ids.includes(row[key])); return q },
      range: async (inicio: number, fim: number) => ({ data: pausas.filter(row => filtros.every(f => f(row))).slice(inicio, fim + 1), error: erro ? { message: 'indisponível' } : null }),
    }
    return q
  } }
}

test('consulta em lote aplica escopo antes de paginar e não perde pausas após 500 registros', async () => {
  const registros = Array.from({ length: 501 }, (_, i) => ({ ...pausa, id: `p${i}` }))
  const db = dbMock(registros)
  const rows = [{ id: 'c1', carteira_id: 'carteira', unidade_id: 'u1', condominio_id: 'condominio' }, { id: 'c2', carteira_id: 'carteira', unidade_id: 'u2', condominio_id: 'condominio' }]
  assert.equal((await carregarPausasRegua(db, [ctx], agora)).length, 501)
  assert.deepEqual((await filtrarCobrancasSemPausa(db, rows, agora)).map(r => r.id), ['c2'])
  assert.ok(db.chamadas.includes('condominio_id'))
  await assert.rejects(filtrarCobrancasSemPausa(dbMock([], true), rows, agora), /conferir as pausas/)
})

test('disponibilidade e painel excluem unidade pausada antes dos totais e páginas, nos dois canais', async () => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://pausa-test.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  globalThis.fetch = async input => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const table = url.pathname.split('/').pop()
    if (table === 'liberar_cobrancas_regulares') return Response.json(0)
    if (table === 'reguas') return Response.json(['email','whatsapp'].map(canal => ({ id: canal, nome: canal, carteira_id: 'carteira', ativo: true })))
    if (table === 'regua_etapas') return Response.json(['email','whatsapp'].map(canal => ({ regua_id: canal, canal, ativo: true })))
    if (table === 'regua_pausas') {
      // A pausa traz unidade+acordo+condomínio: só a consulta por unidade pode retorná-la.
      if (url.searchParams.get('unidade_id')?.startsWith('in.')) return Response.json([pausa])
      if (url.searchParams.get('condominio_id')?.startsWith('in.')) assert.equal(url.searchParams.get('unidade_id'), 'is.null')
      return Response.json([])
    }
    if (table === 'cobrancas') {
      const novo = url.searchParams.get('or')?.includes('.novo')
      return Response.json(['u1','u2'].map((unidade_id, i) => ({
        id: `${novo ? 'nova' : 'ativa'}-${i}`, unidade_id, carteira_id: 'carteira', condominio_id: 'condominio',
        status_operacional: novo ? 'novo' : 'em_cobranca_ativa', vencimento: '2020-01-01', valor_original: 10,
        condominio: { dias_apos_vencimento_regua: 30 }, unidade: { responsavel_nome: 'Responsável', email: 'teste@example.invalid', telefone: '11999999999' },
      })))
    }
    return Response.json([])
  }
  try {
    for (const canal of ['email','whatsapp']) {
      const result = await getFlowCobrancaPageData({ carteiraIds: ['carteira'] } as any, { canal }, { page: 1 })
      assert.equal(result.totalDisponibilidade, 1)
      assert.equal(result.totalPainel, 1)
      assert.equal(result.valorPainel, 10)
      assert.equal(result.disponibilidade[0].unidade_id, 'u2')
      assert.equal(result.painel[0].unidade_id, 'u2')
    }
  } finally {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
  }
})
