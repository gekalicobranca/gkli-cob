import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolverCorrespondenciasUnidade as resolve } from '../lib/core/identidade-unidade'
import { carregarApoiosParaCorrespondencia } from '../features/responsaveis-unidades/correspondencia'
import { motivosSaneamentoAtuais } from '../features/flows/cobranca/saneamento-atual'

test('Lello: códigos completos correspondem às torres, inclusive garagem, sem reescrever a origem',()=>{
  for(const bloco of ['A','B','C','D']) {
    const alvo={identificacao:`${bloco}00072`,bloco:'0'}
    const apoio={unidade:`${bloco}00072`,bloco:`TORRE ${bloco}`}
    assert.deepEqual(resolve(alvo,[apoio]).correspondencias,[apoio])
    assert.deepEqual(alvo,{identificacao:`${bloco}00072`,bloco:'0'})
  }
  assert.equal(resolve({unidade:'VG0416',bloco:'0'},[{unidade:'VG0416',bloco:'GARAGEM'}]).correspondencias.length,1)
})
test('máscaras, aliases de bloco, unidade prefixada, bloco numérico e quadra/lote',()=>{
  for(const [alvo,candidato] of [
    [{unidade:'000112',bloco:'Bloco A'},{unidade:'112',bloco:'A'}],
    [{unidade:'A00072',bloco:'TORRE A'},{unidade:'72',bloco:'A'}],
    [{unidade:'301',bloco:'03'},{unidade:'301',bloco:'3'}],
    [{unidade:'Q03L008',bloco:'Q03'},{unidade:'L008',bloco:'Q3'}],
  ]) assert.equal(resolve(alvo,[candidato]).correspondencias.length,1)
})
test('não cruza condomínio, blocos explícitos ou apartamento numérico sem bloco',()=>{
  assert.equal(resolve({unidade:'112',bloco:'A'},[{unidade:'112',bloco:'B'}]).correspondencias.length,0)
  assert.equal(resolve({unidade:'112',bloco:'0'},[{unidade:'112',bloco:'A'},{unidade:'112',bloco:'B'}]).correspondencias.length,0)
  assert.equal(resolve({unidade:'112',bloco:'A'},[{unidade:'112',bloco:null}]).correspondencias.length,0)
  assert.equal(resolve({unidade:'A72',condominio_id:'um'},[{unidade:'A72',bloco:'A',condominio_id:'outro'}]).correspondencias.length,0)
  assert.equal(resolve({unidade:'A72',bloco:'B'},[{unidade:'A72',bloco:'A'}]).correspondencias.length,0)
})
test('mesmo imóvel permite vários responsáveis sem escolher uma unidade arbitrária',()=>{
  const alvo={unidade:'A00072',bloco:'0'}
  assert.equal(resolve(alvo,[{unidade:'A00072',bloco:'0'},{unidade:'A00072',bloco:'TORRE A'},{unidade:'A00072',bloco:'B'}]).correspondencias.length,2)
  const ambiguo=resolve({unidade:'A72',bloco:'0'},[{unidade:'72',bloco:'A'},{unidade:'2',bloco:'A7'}])
  assert.equal(ambiguo.ambiguo,true)
  assert.equal(ambiguo.correspondencias.length,0)
})
test('saneamento usa a mesma identidade da montagem e do envio',()=>{
  const row={id:'c',condominio_id:'cond',unidade:{identificacao:'B00042',bloco:'0',responsavel_nome:'Pessoa'}}
  const jobs=[{pendencias:[{cobranca_id:'c',saneamento:true}]}]
  const apoios=[{condominio_id:'cond',unidade:'B00042',bloco:'TORRE B',email:'pessoa@example.com'}]
  assert.equal(motivosSaneamentoAtuais([row],jobs,apoios,new Map()).size,0)
})
test('carrega mais de mil contatos e mantém erro de consulta explícito',async()=>{
  let page=0
  const query:any={select:()=>query,eq:()=>query,in:()=>query,order:()=>query,range:async()=>({data:Array.from({length:page++<2?500:7},(_,i)=>({id:i})),error:null})}
  assert.equal((await carregarApoiosParaCorrespondencia({from:()=>query},['cond'])).length,1007)
  query.range=async()=>({data:null,error:{message:'falha'}})
  await assert.rejects(()=>carregarApoiosParaCorrespondencia({from:()=>query},['cond']),/falha/)
})
