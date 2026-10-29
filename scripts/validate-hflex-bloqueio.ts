import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isImportacaoAcordoHflex, bloquearAutomacaoAcordoHflex, statusOperacionalParaCobrancaImportada } from '../features/importacoes/status-cobranca-importada'
import { criarContextoClassificacaoJudicial } from '../features/importacoes/regra-judicial-importacao'
const db = { from() { const q = { select(){return q}, eq(){return q}, async maybeSingle(){return {data:{dias_apos_vencimento_regua:10,acao_judicial:true},error:null}} }; return q } }
test('HFlex identifica número de acordo sem confundir observação genérica', () => {
  assert.equal(isImportacaoAcordoHflex({detalhesOrigem:'Acordo HFlex 1234 | Cobrança 789'}),true)
  assert.equal(isImportacaoAcordoHflex({observacoes:'Possível acordo'}),false)
})
test('HFlex negocia cota na régua sem alterar classificação judicial anterior', async () => {
  const payload={condominio_id:'c',unidade_id:'u',vencimento:'2020-01-01',detalhesOrigem:'Acordo HFlex 1234'}
  assert.equal(await statusOperacionalParaCobrancaImportada(db,payload),'em_negociacao')
  const contexto=criarContextoClassificacaoJudicial([payload,{...payload,vencimento:'2020-02-01'}])
  contexto.unidadesJudiciais.set('u',true)
  assert.equal(await statusOperacionalParaCobrancaImportada(db,payload,contexto,0),'judicializado')
})
test('bloqueia somente a cota reconhecida e preserva cópias arquivadas',async()=>{
  const filters:unknown[]=[]
  const mock={from(table:string){assert.equal(table,'cobrancas');const q={update(p:unknown){filters.push(p);return q},eq(k:string,v:unknown){filters.push([k,v]);return q},async is(k:string,v:unknown){filters.push([k,v]);return {error:null}}};return q}}
  await bloquearAutomacaoAcordoHflex(mock,'cota',{observacoes:'Acordo HFlex 1234'})
  assert.deepEqual(filters,[{automacao_bloqueada:true},['id','cota'],['duplicada_de_id',null]])
})
