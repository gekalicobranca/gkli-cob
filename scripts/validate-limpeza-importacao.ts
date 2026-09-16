import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { limparCobrancasDaNovaImportacao } from '../features/importacoes/recorte-cobrancas'

async function main() {
  const mutations: { table: string; method: string; ids: string | null }[] = []
  let falharConsulta = false
  let somenteAcordos = false
  const db = createClient('https://teste.invalid', 'teste', {
    global: { fetch: async (input, init) => {
      const url = new URL(String(input))
      assert.equal(url.hostname, 'teste.invalid')
      const method = init?.method ?? 'GET'
      const table = url.pathname.split('/').pop()!
      if (method === 'GET') {
        assert.equal(table, 'cobrancas')
        assert.equal(url.searchParams.get('acordo_cobrancas'), 'is.null')
        assert.equal(url.searchParams.get('acordos'), 'is.null')
        assert.match(url.searchParams.get('select')!, /acordo_cobrancas!left\(id\)/)
        assert.match(url.searchParams.get('select')!, /acordos!left\(id\)/)
        assert.equal(url.searchParams.get('carteira_id'), 'eq.carteira')
        assert.equal(url.searchParams.get('condominio_id'), 'in.(condominio)')
        assert.equal(url.searchParams.get('status_operacional'), 'in.(novo)')
        assert.deepEqual(url.searchParams.getAll('vencimento'), ['gte.2026-01-01', 'lte.2026-12-31'])
        if (falharConsulta) return Response.json({ message: 'consulta indisponível' }, { status: 400 })
        return Response.json(somenteAcordos ? [] : [{ id: 'sem-acordo', acordo_cobrancas: [], acordos: [] }])
      }
      mutations.push({ table, method, ids: url.searchParams.get(table === 'cobrancas' ? 'id' : 'cobranca_id') })
      return new Response(null, { status: 204 })
    } },
  })
  const params = { condominioIds: ['condominio'], carteiraId: 'carteira', anoCorrente: 2026 }
  assert.equal(await limparCobrancasDaNovaImportacao(db, params), 1)
  assert.deepEqual(mutations, [
    { table: 'saneamento_cobrancas', method: 'PATCH', ids: 'in.(sem-acordo)' },
    { table: 'cobrancas', method: 'DELETE', ids: 'in.(sem-acordo)' },
  ])
  mutations.length = 0
  somenteAcordos = true
  assert.equal(await limparCobrancasDaNovaImportacao(db, params), 0)
  assert.equal(mutations.length, 0)
  falharConsulta = true
  await assert.rejects(limparCobrancasDaNovaImportacao(db, params), /consulta indisponível/)
  assert.equal(mutations.length, 0)
  console.log('OK: vínculos de acordo excluídos da limpeza; escopo preservado; consulta vazia ou falha não altera dados.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
