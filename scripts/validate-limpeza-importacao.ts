import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { limparCobrancasDaNovaImportacao } from '../features/importacoes/recorte-cobrancas'

async function main() {
  const chamadas: unknown[] = []
  let falharConsulta = false
  let somenteAcordos = false
  let falharLimpeza = false
  let retidas = 0
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
      assert.equal(url.pathname, '/rest/v1/rpc/limpar_lote_importacao_manual')
      assert.equal(method, 'POST')
      chamadas.push(JSON.parse(String(init?.body)))
      if (falharLimpeza) return Response.json({ message: 'limpeza indisponível' }, { status: 400 })
      return Response.json({ removidas: 1 - retidas, retidas_por_envio: retidas })
    } },
  })
  const params = { condominioIds: ['condominio'], carteiraId: 'carteira', anoCorrente: 2026 }
  assert.deepEqual(await limparCobrancasDaNovaImportacao(db, params), { removidas: 1, retidasPorEnvio: 0 })
  assert.deepEqual(chamadas, [{ p_ids: ['sem-acordo'], p_ano: 2026, p_status: ['novo'] }])
  retidas = 1
  assert.deepEqual(await limparCobrancasDaNovaImportacao(db, params), { removidas: 0, retidasPorEnvio: 1 })
  falharLimpeza = true
  await assert.rejects(limparCobrancasDaNovaImportacao(db, params), /limpeza indisponível/)
  chamadas.length = 0
  somenteAcordos = true
  assert.deepEqual(await limparCobrancasDaNovaImportacao(db, params), { removidas: 0, retidasPorEnvio: 0 })
  assert.equal(chamadas.length, 0)
  falharConsulta = true
  await assert.rejects(limparCobrancasDaNovaImportacao(db, params), /consulta indisponível/)
  assert.equal(chamadas.length, 0)
  console.log('OK: vínculos de acordo excluídos da limpeza; escopo preservado; consulta vazia ou falha não altera dados.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
