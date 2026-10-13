import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseRelatorioBuffer } from '../features/conversao-relatorio/server/parse-relatorio-buffer'
import { associarCobrancaConciliada } from '../features/importacoes/reaproveitar-conversao'

async function main() {
  const row = (cells: string[]) => `<tr>${cells.map(v => `<td>${v}</td>`).join('')}</tr>`
  const html = row(['Condomínio: 73 - Teste']) + row(['Recibo','Vencimento','Emissão','Conta','Histórico','Valor','Total Recibo','Total Unidade'])
    + row(['Bloco: B Unidade: 000034'])
    + row(['123','08/09/2026','','7','Rateio','100,00','100,00',''])
    + row(['124','08/10/2026','','7','Rateio','200,00','200,00','300,00'])
    + row(['Bloco: C Unidade: 000034'])
    + row(['AE 125','08/09/2026','','7','Rateio','50,00','50,00','50,00'])
    + row(['Quantidade unidade(s): 2','Total do condomínio 73 :','350,00'])
  const result = await parseRelatorioBuffer({ buffer: Buffer.from(html), filename:'teste.xls', tipoConversao:'cobrancas', somenteAnoCorrente:false })
  assert.ok(result.ok)
  if (!result.ok) return
  assert.deepEqual(result.preview.cobrancas.map(c => [c.bloco,c.unidade,c.recibo,c.valorTotal]),
    [['B','000034','123',100],['B','000034','124',200],['C','000034','AE 125',50]])
  assert.equal(result.preview.cobrancas[2].situacaoOrigem,'acordo_extrajudicial')
  assert.match(result.preview.csv,/000034/)
  let patch: any; const filters: any[] = []
  const query: any = { update: (value:any) => { patch=value;return query }, eq:(...args:any[])=>{filters.push(args);return query},
    is:(...args:any[])=>{filters.push(args);return query}, select:async()=>({data:[{id:'debito'}],error:null}) }
  await associarCobrancaConciliada({from:()=>query},'debito',{condominio_id:'cond',unidade_id:'unid',carteira_id:'cart',conversao_relatorio_id:'nova'})
  assert.deepEqual(patch,{conversao_relatorio_id:'nova'})
  assert.deepEqual(filters,[['id','debito'],['condominio_id','cond'],['unidade_id','unid'],['duplicada_de_id',null],['carteira_id','cart']])
  query.select=async()=>({data:[],error:null})
  await assert.rejects(()=>associarCobrancaConciliada({from:()=>query},'debito',{condominio_id:'cond',unidade_id:'unid',conversao_relatorio_id:'nova'}),/reaproveitar/)
  if (process.argv[2]) {
    const real = await parseRelatorioBuffer({buffer:readFileSync(process.argv[2]),filename:'square_2026-10-13.xls',tipoConversao:'cobrancas'})
    assert.ok(real.ok)
    if(real.ok){assert.equal(real.preview.cobrancas.length,36);assert.ok(real.preview.cobrancas.every(c=>c.bloco&&c.recibo));console.log('Square real: 36 recibos, blocos e totais conferidos.')}
  }
  console.log('Blocos, recibos separados, marcadores e reaproveitamento sem alterar status/valores validados.')
}
main().catch(e=>{console.error(e);process.exitCode=1})
