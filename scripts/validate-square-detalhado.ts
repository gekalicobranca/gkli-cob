import assert from 'node:assert/strict'
import {lerAnaliseOriginal} from '../features/condominios/relatorio-inadimplencia/leitura'
import {consolidar} from '../features/condominios/relatorio-inadimplencia/modelo'
const row=(v:string[])=>'<tr>'+v.map(s=>'<td>'+s+'</td>').join('')+'</tr>'
const header=row(['Recibo','Vencimento','Emissão','Conta','Histórico','Valor','Total Recibo','Total Unidade'])
const html=row(['Condomínio: 1 - Teste'])+header+row(['Bloco: A Unidade: 001'])+row(['J 1','01/01/2020','','7','Rateio Mensal','90,00','',''])+row(['J 1','01/01/2020','','49','Fundo','10,00','100,00','100,00'])+row(['Bloco: B Unidade: 001'])+row(['AE 2','08/09/2026','','7','Rateio Mensal','50,00','50,00','50,00'])+row(['Quantidade unidade(s): 2','Total do condomínio 1 :','150,00'])
const parse=(s:string)=>lerAnaliseOriginal(Buffer.from(s),'teste_2026-09-12.xls')!
const a=parse(html);assert.equal(a.totais.total,15000);assert.equal(a.totais.multa,null);assert.equal(a.recibos.length,2);assert.equal(a.itens.length,3);assert.equal(consolidar(a).length,2);assert.equal(consolidar(a)[0].mais5,10000)
assert.throws(()=>parse(html.replace('150,00','151,00')),/soma/)
assert.throws(()=>parse(html.replace('90,00','91,00')),/Itens/)
assert.throws(()=>parse(html.replace('08/09/2026','31/02/2026')),/vencimento/)
const proc:any={numero:'teste',parte:'',unidade:'',cobrancaPropria:true,debitosCobrados:[{vencimento:'2020-01-01'}]}
assert.equal(consolidar(a,{processos:[proc]}).flatMap(u=>u.processos).length,0)
console.log('Square: blocos separados, prefixos preservados, faixas calculadas, totais conciliados, datas inválidas e vínculos sem evidência bloqueados.')
