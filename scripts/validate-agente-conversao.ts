import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { processarRelatorioCaptado } from '../features/captacao-automatizada/processar-relatorio'

// Exercita o parser real; todas as consultas e gravações são simuladas.
async function main() {
  const arquivo = process.argv[2]
  assert.ok(arquivo, 'Informe um relatório XLS de teste.')
  const buffer = await readFile(arquivo)
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://teste.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'teste'
  const registros = new Map<string, Record<string, any>>()
  let falhar = false
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    assert.equal(url.hostname, 'teste.invalid', 'Nenhuma chamada externa é permitida no teste')
    const tabela = url.pathname.split('/').pop()
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
    if (tabela === 'condominios') return json([{ id: 'condominio', carteira_id: 'carteira', nome: 'Square Guarulhos', captacao_automatica_habilitada: true }])
    if (tabela === 'conversoes_relatorio') {
      const row = JSON.parse(String(init?.body))
      if (falhar) return json({ code: 'XX000', message: 'Falha simulada' }, 500)
      if (registros.has(row.id)) return json({ code: '23505', message: 'duplicado' }, 409)
      registros.set(row.id, row)
      return json({ id: row.id }, 201)
    }
    if (tabela === 'relatorios_inadimplencia_unificados') return json({ id: 'marcador' }, 201)
    throw new Error(`Operação inesperada: ${url.pathname}`)
  }
  const entrada = { buffer, nomeArquivo: path.basename(arquivo) }
  const options = { condominioId: 'condominio', conversaoId: 'arquivo-unico' }
  const resultados = await Promise.all([
    processarRelatorioCaptado(entrada, options),
    processarRelatorioCaptado(entrada, options),
  ])
  assert.equal(registros.size, 1)
  assert.ok(resultados.every(r => r.conversaoId === 'arquivo-unico' && r.cobrancas > 0))
  assert.equal(registros.get('arquivo-unico')?.status, 'aguardando_validacao')
  falhar = true
  await assert.rejects(processarRelatorioCaptado(entrada, { ...options, conversaoId: 'outro' }), /Falha simulada/)
  console.log(`OK: XLS convertido (${resultados[0].cobrancas} cobranças), cliques simultâneos sem duplicação e erro de gravação propagado. Nenhum dado real alterado.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
