import assert from 'node:assert/strict'
import { concluirExecucaoMaestro } from './agente-automatico/concluir-maestro.mjs'

const db = (origem, error = null) => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { origem }, error }) }) }) }) })
const neverFetch = () => { throw new Error('HTTP não deveria ser chamado') }
for (const origem of [null, 'manual', 'manual_agendada', 'manual_worker:teste']) {
  assert.equal(await concluirExecucaoMaestro(db(origem), 'execucao', neverFetch), false)
}
await assert.rejects(concluirExecucaoMaestro(db('maestro', new Error('banco indisponível')), 'execucao', neverFetch), /banco indisponível/)
process.env.CAPTACAO_MAESTRO_URL = 'https://maestro.invalid/'
process.env.CAPTACAO_ORQUESTRADOR_SECRET = 'segredo-teste'
for (const origem of ['maestro', 'maestro_agendada', 'agenda_mensal']) {
  let chamadas = 0
  assert.equal(await concluirExecucaoMaestro(db(origem), 'execucao', async (url, options) => {
    chamadas++
    assert.equal(url, 'https://maestro.invalid/api/agente-automatico/execucoes/execucao/concluir')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.authorization, 'Bearer segredo-teste')
    return Response.json({ ok: true })
  }), true)
  assert.equal(chamadas, 1)
}
await assert.rejects(concluirExecucaoMaestro(db('maestro'), 'execucao', async () => Response.json({ ok: false, error: 'Relatório inválido' }, { status: 500 })), /Relatório inválido/)
console.log('OK: origens permitidas, autenticação e propagação de falhas; nenhum dado real alterado.')
