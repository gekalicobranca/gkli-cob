import assert from 'node:assert/strict'
import test from 'node:test'
import { interpretarLelloRecebimentos as ler } from './lello-recebimentos-parser.mjs'
const meta=[['Acordo Número','123'],['Unidade','200024','Em Andamento']]
const parcelas=[['Vencimento','Tipo','Dt.Pagto.','Status','Valor'],['10/10/2026','Boleto','05/10/2026','Contabilizado','100,00'],['10/11/2026','Boleto','','Pendente','100,00'],['Valor Total:','200,00'],['Valor Pago:','100,00'],['Valor Em Aberto:','100,00']]
const input={acordo:'123',unidade:'200024'}
test('acordo completo distingue parcelas pagas e pendentes e preserva data real',()=>{
 const r=ler([meta,parcelas],input);assert.equal(r.parcelas.length,2);assert.equal(r.parcelas[0].data_pagamento,'2026-10-05');assert.equal(r.parcelas[1].data_pagamento,null);assert.equal(r.saldo_centavos,10000)
})
test('recusa escopo, subtotal e data inválidos',()=>{
 assert.throws(()=>ler([meta,parcelas],{...input,unidade:'100001'}))
 const ruim=structuredClone(parcelas);ruim[3][1]='300,00';assert.throws(()=>ler([meta,ruim],input))
 const dt=structuredClone(parcelas);dt[1][2]='31/02/2026';assert.throws(()=>ler([meta,dt],input))
})
test('recibo individual preserva ID bancário e não confunde cota original com parcela',()=>{
 const tabela=[['Número Parcela','Vencimento','Dt.Pagto.','Historico','Tipo','Status','Agencia.Pagto.','Banco.Pagto.'],['999','10/10/2026','05/10/2026','Parcela 3 Acordo 123','Boleto','Contabilizado','1','237'],['Valor Original:','100,00'],['Valor Pago:','100,00']]
 const r=ler([meta,tabela],{...input,recibo:'888'});assert.equal(r.numero,3);assert.equal(r.parcela_externa,'999');assert.equal(r.recibo_consultado,'888');assert.equal(r.confirmado_na_fonte,true)
 const errado=structuredClone(tabela);errado[1][3]='Parcela 3 Acordo 321';assert.throws(()=>ler([meta,errado],{...input,recibo:'888'}))
})
