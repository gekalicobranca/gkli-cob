import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { montarCatalogo, dataCatalogo, type CotaCatalogo } from '../features/cobrancas/catalogo'
import { gerarCatalogoPdf } from '../features/cobrancas/catalogo-pdf'

const base = '2026-09-18'
const cota = (id: string, changes: Partial<CotaCatalogo> = {}): CotaCatalogo => ({
  id, carteira_id: 'a', condominio_id: 'a', unidade_id: '101', competencia: '07/2026',
  vencimento: '2026-07-10', valor_atualizado: 100.10, status_operacional: 'novo', status_financeiro: 'em_aberto',
  carteiras: { nome: 'Carteira Centro' }, condominios: { nome: 'Condomínio Acácias', inicio_cobranca_dias: 30 },
  unidades: { identificacao: '101', bloco: 'A', responsavel_nome: 'Responsável de demonstração', telefone: '(11) 99999-0000', email: 'demonstracao@example.com' },
  ...changes,
})
async function main() {
  const filtered = montarCatalogo([
    cota('1'), cota('1'), cota('2', { vencimento: '2026-08-19' }),
    cota('recent', { vencimento: '2026-08-20' }), cota('future', { vencimento: '2026-10-01' }),
    cota('invalid', { vencimento: 'inválido' }), cota('paid', { status_financeiro: 'quitado' }),
    cota('agreement', { status_operacional: 'acordo_firmado' }), cota('suspended', { status_operacional: 'suspenso' }),
    cota('renegotiated', { status_financeiro: 'renegociado' }), cota('zero', { valor_atualizado: 0 }),
    cota('other', { unidade_id: '202', unidades: { identificacao: '202', acao_judicial: true }, valor_atualizado: 500 }),
    cota('pre', { vencimento: '2026-09-17', status_operacional: 'pre_juridico' }),
  ], base)
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].total, 70020)
  assert.equal(filtered[0].unidades[0].dados?.identificacao, '202')
  assert.equal(filtered[0].unidades[0].juridico, true)
  assert.equal(filtered[0].unidades[1].pre, true)
  assert.equal(filtered[0].unidades[1].cotas.length, 2)
  assert.equal(montarCatalogo([cota('null-rule', { vencimento: '2026-09-17', condominios: { nome: 'Teste', inicio_cobranca_dias: null } })], base).length, 0)
  assert.equal(dataCatalogo(new Date('2026-09-18T01:00:00Z')), '2026-09-17')

  const rows: CotaCatalogo[] = []
  for (let g = 39; g >= 0; g--) {
    const group = String(g).padStart(2, '0')
    const carteira = g < 20 ? 'Carteira Centro' : 'Carteira Norte'
    for (let n = 0; n < (g === 0 ? 65 : 3); n++) rows.push(cota(`${g}-${n}`, {
      carteira_id: g < 20 ? 'a' : 'b', carteiras: { nome: carteira }, condominio_id: group,
      condominios: { nome: `Condomínio ${group} - Residencial das Acácias`, inicio_cobranca_dias: 30 },
      status_operacional: g % 3 === 0 ? 'judicializado' : g % 3 === 1 ? 'pre_juridico' : 'novo',
      competencia: `${String(n + 1).padStart(2, '0')}/2020`,
      unidades: { identificacao: '101', bloco: 'A', responsavel_nome: 'Responsável de demonstração com nome longo para validar quebra automática', telefone: '(11) 99999-0000', email: `${'contato'.repeat(10)}@example.com` },
    }))
  }
  const groups = montarCatalogo(rows, base)
  assert.equal(groups[0].id, '00'); assert.equal(groups[39].id, '39')
  const pdf = await gerarCatalogoPdf(groups, base)
  const parsed = await PDFDocument.load(pdf)
  assert.ok(parsed.getPageCount() > 42, 'Índice e cotas devem continuar em novas páginas')
  await mkdir('tmp/pdfs', { recursive: true })
  await writeFile('tmp/pdfs/catalogo-validacao.pdf', pdf)
  await writeFile('tmp/pdfs/catalogo-vazio.pdf', await gerarCatalogoPdf([], base))
  console.log(`Catálogo validado: regras, totais, ordenação, indicadores e PDF com ${parsed.getPageCount()} páginas.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
