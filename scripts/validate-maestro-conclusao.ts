import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { POST } from '../app/api/agente-automatico/execucoes/[id]/concluir/route'

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://teste.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'teste'
  process.env.CAPTACAO_ORQUESTRADOR_SECRET = 'teste-secret'
  let origem = 'manual'
  let statusArquivo = 'aguardando_validacao'
  let consultas = 0
  globalThis.fetch = async (input) => {
    consultas++
    const url = new URL(String(input))
    assert.equal(url.hostname, 'teste.invalid')
    const table = url.pathname.split('/').pop()
    if (table === 'agente_execucoes') return Response.json({ id: 'execucao', origem, condominio_id: 'condominio', carteira_id: 'carteira', status: 'em_execucao' })
    if (table === 'agente_arquivos') return Response.json({ id: 'arquivo', status_validacao: statusArquivo })
    if (table === 'conversoes_relatorio') return Response.json({ id: 'arquivo', condominio_id: 'outro', carteira_id: 'carteira' })
    throw new Error(`Operação inesperada: ${url}`)
  }
  const call = (authorized = true) => POST(new NextRequest('https://maestro.invalid/api/agente-automatico/execucoes/execucao/concluir', {
    method: 'POST', headers: authorized ? { authorization: 'Bearer teste-secret' } : {},
  }), { params: Promise.resolve({ id: 'execucao' }) })
  assert.equal((await call(false)).status, 401)
  assert.equal(consultas, 0)
  assert.equal((await call()).status, 403)
  origem = 'maestro'
  statusArquivo = 'rejeitado'
  assert.match((await (await call()).json()).error, /disponível para validação/)
  statusArquivo = 'aguardando_validacao'
  assert.match((await (await call()).json()).error, /não corresponde/)
  console.log('OK: endpoint bloqueia chamadas sem credencial, origem manual, arquivo rejeitado e conversão de outro condomínio.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
