import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as parcelas from '../features/acordos/parcelas-executivo'
import * as identidade from '../features/exportacoes/identidade-visual'
import * as valores from '../features/acordos/valor-relatorio'
import * as currency from '../utils/formatters/currency'
import * as date from '../utils/formatters/date'
import parsePdf from 'pdf-parse/lib/pdf-parse.js'

async function main() {
  const grade = [
    { id: 'antes', numero: 1, valor: 100, vencimento: '2026-10-12', status: 'paga' },
    { id: 'inicio', numero: 2, valor: 1234.56, vencimento: '2026-10-13', status: 'paga', data_pagamento: '2026-10-15', valor_repasse_informado: 125.25 },
    { id: 'fim', numero: 3, valor: 345.67, vencimento: '2026-11-11', status: 'aberta', valor_repasse_informado: null },
    { id: 'depois', numero: 4, valor: 9999, vencimento: '2026-11-12', status: 'aberta' },
  ]
  assert.deepEqual(parcelas.parcelasDoPeriodoExecutivo(grade, '2026-10-13', '2026-11-11').map(p => p.id), ['inicio', 'fim'])
  assert.equal(parcelas.parcelasDoPeriodoExecutivo(grade).length, 4)
  assert.equal(parcelas.parcelasDoPeriodoExecutivo(grade, '', '2026-10-13').length, 2)
  assert.equal(parcelas.pagamentoParcelaExecutivo({ status: 'aberta', data_pagamento: '2026-10-15' }), 'Paga')
  assert.equal(parcelas.pagamentoParcelaExecutivo({ status: 'aberta' }), 'Sem baixa')
  assert.equal(parcelas.repasseParcelaExecutivo({ valor_repasse_informado: null }), null)
  assert.equal(parcelas.repasseParcelaExecutivo({ valor_repasse_informado: 0 }), 0)
  const modules: Record<string, unknown> = {
    '@/features/acordos/parcelas-executivo': parcelas,
    '@/features/exportacoes/identidade-visual': identidade,
    '@/features/acordos/valor-relatorio': valores,
    '@/utils/formatters/currency': currency,
    '@/utils/formatters/date': date,
    '@/features/acordos/filtros-relatorio': {},
    '@/features/acordos/queries': {},
    '@/features/acordos/parcelas-relatorio': {},
    '@/utils/supabase/server': {},
    '@/utils/auth/get-permitted-carteiras': {},
  }
  const source = readFileSync('app/api/acordos/relatorio-executivo/route.ts', 'utf8') + '\nexport { montarPdf, enriquecerAcordos };'
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const context = { exports: {} as any, Buffer, Date, Intl, require: (name: string) => { assert.ok(name in modules, name); return modules[name] } }
  vm.runInNewContext(code, context)
  const row = { id: 'teste', status: 'ativo', valor_acordado: 11679.23, carteiras: { nome: 'Carteira Exemplo' }, condominios: { nome: 'Condomínio Exemplo', cnpj: '00.000.000/0001-00' }, unidades: { identificacao: '101', bloco: 'A', responsavel_nome: 'Responsável Exemplo' } }
  const enriched = context.exports.enriquecerAcordos([row], new Map([['teste', grade]]), '2026-10-13', '2026-11-11')
  const output = '.tmp/executivo-parcelas-periodo'; mkdirSync(output, { recursive: true })
  const sample = await identidade.aplicarIdentidadePdf(context.exports.montarPdf(enriched, true, '2026-10-13', '2026-11-11'))
  writeFileSync(`${output}/sample.pdf`, sample)
  const parsed = await parsePdf(sample)
  for (const expected of ['1.234,56', '345,67', '125,25', 'Não informado', 'Sem baixa', '15/10/2026', 'Repasse previsto']) assert.ok(parsed.text.includes(expected), expected)
  const many = Array.from({length: 45}, (_, i) => ({...grade[1], id: `stress-${i}`, numero: i + 1, vencimento: '2026-10-13'}))
  const stressRows = context.exports.enriquecerAcordos([row], new Map([['teste', many]]), '2026-10-13', '2026-11-11')
  const stress = await identidade.aplicarIdentidadePdf(context.exports.montarPdf(stressRows, false, '2026-10-13', '2026-11-11'))
  writeFileSync(`${output}/stress.pdf`, stress)
  const parsedStress = await parsePdf(stress)
  assert.ok(parsedStress.text.includes('#45'))
  assert.ok(parsedStress.text.includes('Continuação'))
  console.log(`Executivo validado: limites inclusivos, múltiplas parcelas, pagamento, repasse ausente/zero, PDF de ${parsed.numpages} páginas e teste de quebra de ${parsedStress.numpages} páginas.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
