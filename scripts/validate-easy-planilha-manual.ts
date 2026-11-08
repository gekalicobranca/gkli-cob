import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import * as XLSX from 'xlsx';
import {lerPlanilhaManualEasy} from '../features/easy-cob/planilha-manual';
const condo={cnpj:'12345678000190',nome:'CONDOMÍNIO GEKALI TESTE'};
async function fixture(){
  const wb=XLSX.read(await readFile('public/modelos/easy-flow-importacao.xlsx'),{type:'buffer',cellDates:false});const s=wb.Sheets['Cobranças'];
  s.B3={t:'s',v:condo.cnpj};
  Object.assign(s,{A9:{t:'s',v:'01'},B9:{t:'s',v:'000001'},C9:{t:'s',v:'10/09/2026'},D9:{t:'n',v:100},E9:{t:'n',v:2},F9:{t:'n',v:3},G9:{t:'n',v:1},I9:{t:'s',v:'OPERADOR TESTE'},J9:{t:'s',v:'teste@example.invalid'}});
  return {wb,s,parse:()=>lerPlanilhaManualEasy(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),'modelo.xlsx',condo)};
}
test('modelo entregue preserva identificadores, componentes financeiros e total calculado no servidor',async()=>{
  const {s,parse}=await fixture();s.H9.v=999;const p=parse();
  assert.equal(p.cobrancas.length,1);assert.equal(p.cobrancas[0].unidade,'000001');assert.equal(p.cobrancas[0].bloco,'01');assert.equal(p.cobrancas[0].vencimento,'10/09/2026');
  assert.equal(p.cobrancas[0].valorPrincipal,100);assert.equal(p.cobrancas[0].multa,2);assert.equal(p.cobrancas[0].juros,3);assert.equal(p.cobrancas[0].correcao,1);assert.equal(p.valorTotal,106);
  s.C9={t:'n',v:(Date.UTC(2026,8,10)-Date.UTC(1899,11,30))/86400000};assert.equal(parse().cobrancas[0].vencimento,'10/09/2026');
});
test('arquivo vazio, outro condomínio, datas, valores, contatos e fórmulas inválidas bloqueiam toda a prévia',async()=>{
  const blank=await readFile('public/modelos/easy-flow-importacao.xlsx');assert.throws(()=>lerPlanilhaManualEasy(blank,'modelo.xlsx',condo),/CNPJ/);
  const cases:[string,(s:XLSX.WorkSheet)=>void,RegExp][]=[
    ['CNPJ',s=>{s.B3.v='99999999000199';},/CNPJ/],
    ['cabeçalho',s=>{s.B8.v='Outra coisa';},/títulos/],
    ['data',s=>{s.C9.v='30/02/2026';},/Linha 9.*vencimento/],
    ['valor negativo',s=>{s.D9.v=-1;},/Linha 9/],
    ['precisão',s=>{s.D9.v=1.001;},/Linha 9/],
    ['e-mail',s=>{s.J9.v='invalido';},/Linha 9.*e-mail/],
    ['sem contato',s=>{delete s.J9;},/Linha 9.*contato|Linha 9.*telefone/],
    ['fórmula externa',s=>{s.H9.f='WEBSERVICE("https://example.invalid")';},/Linha 9.*fórmula/],
    ['valor manual divergente',s=>{s.H9={t:'n',v:10};},/Linha 9.*não confere/],
  ];
  for(const [name,edit,pattern] of cases){const f=await fixture();edit(f.s);assert.throws(f.parse,pattern,name);}
  const f=await fixture();delete f.s.B9;assert.throws(f.parse,/Linha 9.*unidade/);
});
test('duplicidades e divergência de contatos na mesma unidade não geram importação parcial',async()=>{
  const f=await fixture();
  for(const col of ['A','B','C','D','E','F','G','I','J'])f.s[`${col}10`]={...f.s[`${col}9`]};
  assert.throws(f.parse,/repete uma cobrança/);
  f.s.C10={t:'s',v:'11/09/2026'};f.s.J10={t:'s',v:'outro@example.invalid'};assert.throws(f.parse,/Linha 10.*contatos/);
});
