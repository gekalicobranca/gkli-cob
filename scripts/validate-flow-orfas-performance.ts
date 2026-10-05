import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAdminClient } from '../utils/supabase/admin'
import { carregarCanaisOcupados } from '../features/flows/cobranca/vinculos-canais'

for (const count of [0, 499, 500, 'erro'] as const) {
  test(`checagem agrupada de órfãs com ${count} registros preserva bloqueios e recorte`, async () => {
    const fetchOriginal = globalThis.fetch
    const urlOriginal = process.env.NEXT_PUBLIC_SUPABASE_URL
    const keyOriginal = process.env.SUPABASE_SERVICE_ROLE_KEY
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://flow-orfas.invalid'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'teste'
    const requests: URL[] = []
    const ids = Array.from({ length: 700 }, (_, i) => `c${i}`)
    globalThis.fetch = async input => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      requests.push(url)
      if (url.pathname.endsWith('/lote_itens')) return Response.json([])
      assert.ok(url.pathname.endsWith('/mensagens'))
      assert.equal(url.searchParams.get('cobranca_flow_id'), 'is.null')
      assert.equal(url.searchParams.get('status'), 'in.(pendente_aprovacao,aprovada,agendada)')
      if (url.searchParams.has('carteira_id')) {
        assert.equal(url.searchParams.get('carteira_id'), 'in.(permitida)')
        assert.equal(url.searchParams.get('limit'), '500')
        if (count === 'erro') return Response.json({ code: '57014', message: 'Timeout simulado' }, { status: 400 })
        return Response.json(Array.from({ length: count }, (_, i) => ({
          id: `m${i}`, cobranca_id: count === 499 && i === 0 ? 'c699' : `fora${i}`, canal: 'email',
        })))
      }
      const parte = (url.searchParams.get('cobranca_id') ?? '').slice(4, -1).split(',')
      return Response.json(parte.includes('c699') ? [{ id: 'm-final', cobranca_id: 'c699', canal: 'email' }] : [])
    }
    try {
      const canais = await carregarCanaisOcupados(createAdminClient(), ids, { carteiraIds: ['permitida', 'permitida'] })
      assert.equal(canais.has('c699'), count !== 0)
      if (count !== 0) assert.deepEqual([...canais.get('c699')!], ['email'])
      assert.ok([...canais.keys()].every(id => ids.includes(id)))
      const porId = requests.filter(url => url.pathname.endsWith('/mensagens') && url.searchParams.has('cobranca_id'))
      assert.equal(porId.length, typeof count === 'number' && count < 500 ? 0 : 9)
      assert.equal(requests.filter(url => url.searchParams.has('carteira_id')).length, 1)
    } finally {
      globalThis.fetch = fetchOriginal
      if (urlOriginal === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
      else process.env.NEXT_PUBLIC_SUPABASE_URL = urlOriginal
      if (keyOriginal === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
      else process.env.SUPABASE_SERVICE_ROLE_KEY = keyOriginal
    }
  })
}
