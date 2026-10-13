import assert from 'node:assert/strict'
import { POST } from '../app/api/agente-automatico/execucoes/[id]/montar-flow/route'

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://teste.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'teste'
  process.env.CAPTACAO_ORQUESTRADOR_SECRET = 'teste-secret'
  const id = '11111111-1111-4111-8111-111111111111'
  let origem = 'maestro'
  let chamadas = 0
  let claims = 0
  globalThis.fetch = async (input, options) => {
    chamadas++
    const url = new URL(String(input))
    assert.equal(url.hostname, 'teste.invalid')
    const tabela = url.pathname.split('/').at(-1)
    if (tabela === 'agente_execucoes') return Response.json({ origem, agendado_para: null, condominio_id: 'condominio', carteira_id: 'carteira' })
    if (tabela === 'maestro_flow_montagens') {
      assert.ok(url.searchParams.has('execucao_id') || url.searchParams.has('id'))
      return Response.json({ id, status: 'pendente', condominio_id: 'condominio', carteira_id: 'carteira', flow_ids: [], parte: 0 })
    }
    if (tabela === 'automacao_controle') return Response.json({ ativo: false })
    if (tabela === 'maestro_flow_claim_execucao') {
      claims++
      assert.equal(options?.method, 'POST')
      assert.deepEqual(JSON.parse(options?.body as string), { p_execucao_id: id })
      return Response.json([])
    }
    throw new Error(`Chamada não autorizada pelo teste: ${tabela}`)
  }
  const call = (authorized = true) => POST(new Request(`https://maestro.invalid/api/agente-automatico/execucoes/${id}/montar-flow`, { method: 'POST', headers: authorized ? { authorization: 'Bearer teste-secret' } : {} }), { params: Promise.resolve({ id }) })
  assert.equal((await call(false)).status, 401)
  assert.equal(chamadas, 0)
  origem = 'agenda_mensal'
  assert.equal((await call()).status, 403)
  assert.equal(claims, 0)
  origem = 'maestro'
  assert.equal((await call()).status, 200)
  assert.equal(claims, 1)
  console.log('OK: montagem manual autentica, restringe a execução e não aciona fila global, agenda ou envio.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
