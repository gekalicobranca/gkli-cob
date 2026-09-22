import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { PDFDocument } from 'pdf-lib'
import { analiseResumida, lerAnaliseOriginal, lerProcessos } from '../features/condominios/relatorio-inadimplencia/leitura'
import { consolidar, cortes, estadoProcesso, marcaEscritorio, natureza, ProcessoRelatorio, AnaliseInadimplencia } from '../features/condominios/relatorio-inadimplencia/modelo'
import { gerarPdfInadimplencia } from '../features/condominios/relatorio-inadimplencia/pdf'

async function main() {
  assert.equal(natureza('CARTAO DE ACESSO'), 'Outros débitos')
  assert.equal(natureza('TX COND FEV/2025'), 'Taxa condominial')
  assert.equal(natureza('COND. AGO/2020'), 'Taxa condominial')
  assert.equal(natureza('COTA CONDOMINIAL SET/2026'), 'Taxa condominial')
  assert.equal(natureza('TX COND RESID'), 'Taxa condominial')
  assert.equal(natureza('COND. AGOSTO/2026'), 'Taxa condominial')
  assert.equal(natureza('LAUDO AR CONDICIONADO'), 'Outros débitos')
  assert.equal(natureza('CESSÃO DE ESPAÇO'), 'Cessão de espaço')
  assert.equal(natureza('C. SETEMBRO', '1002', 'hubert'), 'Taxa condominial')
  assert.equal(natureza('COTA FUNDO', '1022', 'hubert'), 'Outros débitos')
  const p: ProcessoRelatorio = { numero: '1234567-89.2025.8.26.0100', parte: 'Pessoa Teste', unidade: '', classe: 'Execução', assunto: '', polo: 'Exequente', situacao: 'Extinto; publicação mais recente', advogado: 'Lidiane Genske Baia', escritorio: '', origem: '', fonte: '', observacoes: '', cobrancaPropria: true }
  assert.equal(estadoProcesso(p), 'historico')
  assert.equal(estadoProcesso({ ...p, situacao: 'Suspenso' }), 'suspenso')
  assert.equal(marcaEscritorio(p), 'G')
  assert.equal(marcaEscritorio({ ...p, advogado: 'Outro', escritorio: 'Não identificado' }), 'NI')
  const c = cortes('2026-09-11')
  const a: AnaliseInadimplencia = { versao: 1, arquivo: 'teste', condominioFonte: 'Teste', dataBase: '2026-09-11', dataBaseInferida: false, qualidade: 'completa', itens: [], observacoes: [], encargosPorNatureza: false,
    recibos: [c.sessenta, '2026-07-12', c.cinco, '2021-09-10', '2026-09-01'].map((v, i) => ({ id: String(i), bloco: '', unidade: '001', responsavel: 'Pessoa Teste', vencimento: v, principal: 100, multa: 0, correcaoJuros: 0, total: 100 })), totais: { principal: 500, multa: 0, correcaoJuros: 0, total: 500 } }
  const u = consolidar(a, { processos: [p] })[0]
  assert.equal(u.mais60, 300); assert.equal(u.mais5, 100); assert.equal(u.entre60e5, 100); assert.equal(u.processos.length, 1)
  assert.equal(consolidar(a, { processos: [{ ...p, parte: 'Outra pessoa' }] })[0].processos.length, 0)
  assert.equal(consolidar(a, { processos: [{ ...p, parte: 'Outra pessoa; Pessoa Teste' }] })[0].processos.length, 1)
  assert.equal(consolidar(a, { processos: [{ ...p, parte: 'Pessoa Teste e outros' }] })[0].processos.length, 1)
  assert.equal(consolidar(analiseResumida({ unidades: [{ unidade: '1', valor: 10 }] }, 'teste'))[0].mais60, null)
  const headers = Array(19).fill(''); headers[2] = 'Processo'; headers[15] = 'Escritório responsável'
  const row = Array(19).fill(''); row[1] = '123'; row[2] = p.numero
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, row]), 'Processos')
  assert.throws(() => lerProcessos(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), 'teste.xlsx', '456'), /outro CNPJ/)
  const pdf = await gerarPdfInadimplencia(a, { processos: [p] }, { nome: 'Condomínio de teste' })
  assert.ok((await PDFDocument.load(pdf)).getPageCount() >= 5)

  // Integração opcional com fontes privadas locais; nunca incorporadas como fixtures.
  const [original, processos, cnpj, output] = process.argv.slice(2)
  if (original) {
    const real = lerAnaliseOriginal(readFileSync(original), original.split(/[\\/]/).at(-1)!)!
    assert.ok(real)
    if (original.includes('CO_NEXT')) {
      assert.equal(real.totais.total, 8554333); assert.equal(real.recibos.length, 127); assert.equal(real.itens.length, 967)
      assert.equal(real.itens.filter(i => i.natureza === 'Taxa condominial').reduce((s, i) => s + (i.principal ?? 0), 0), 6021764)
      const us = consolidar(real); assert.equal(us.filter(u => u.mais60! > 0).length, 21); assert.equal(us.reduce((s, u) => s + u.mais60!, 0), 5029240)
      assert.equal(us.reduce((s, u) => s + u.mais5!, 0), 0)
    } else if (original.includes('VILLA_LOBOS')) {
      assert.equal(real.totais.total, 105695017); assert.equal(real.itens.length, 1811)
      assert.equal(real.itens.filter(i => i.natureza === 'Cessão de espaço').reduce((s, i) => s + (i.total ?? 0), 0), 28435228)
    }
    const ps = processos ? lerProcessos(readFileSync(processos), processos.split(/[\\/]/).at(-1)!, cnpj) : []
    const bytes = await gerarPdfInadimplencia(real, { processos: ps }, { nome: real.condominioFonte, cnpj })
    if (output) { mkdirSync('tmp/pdfs', { recursive: true }); writeFileSync(output, bytes) }
    console.log(`Origem validada: ${real.recibos.length} recibos; PDF: ${(await PDFDocument.load(bytes)).getPageCount()} páginas.`)
  }
  console.log('Relatório: cálculos, limites estritos, isolamento por CNPJ, categorias, estados processuais e geração PDF aprovados.')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
