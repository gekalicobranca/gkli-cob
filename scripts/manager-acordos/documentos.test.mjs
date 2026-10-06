import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { verificarCadastro } from './documentos.mjs'

test('fila recusa inativos, outra administradora, código adulterado e carteira alterada', () => {
  const config = { habilitado: true, carteira_id: 'a', codigo_cliente: '00656' }
  const condo = { status: 'ativo', administradora: 'Manager', carteira_id: 'a' }
  assert.doesNotThrow(() => verificarCadastro(config, condo, '00656'))
  for (const alterado of [{ ...condo, status: 'inativo' }, { ...condo, administradora: 'BBZ' }, { ...condo, carteira_id: 'b' }]) assert.throws(() => verificarCadastro(config, alterado, '00656'))
  assert.throws(() => verificarCadastro(config, condo, '656'))
  assert.throws(() => verificarCadastro({ ...config, habilitado: false }, condo, '00656'))
})
test('consumidor escreve somente na fila, presença e armazenamento próprios', async () => {
  const worker = await readFile(new URL('./fila.mjs', import.meta.url), 'utf8')
  const tabelas = [...worker.matchAll(/\.from\('([^']+)'\)/g)].map(m => m[1])
  assert.ok(tabelas.every(t => ['agente_acordos_execucoes', 'agente_acordos_configuracoes', 'agente_acordos_workers', 'condominios'].includes(t)))
  assert.ok(!/features\/agente-automatico|agente_execucoes|agente_receitas|concluirExecucaoMaestro|captacaoGlobalAtiva/.test(worker))
  const documentos = await readFile(new URL('./documentos.mjs', import.meta.url), 'utf8')
  assert.ok(documentos.includes("storage.from('acordos-pdfs')"))
})
