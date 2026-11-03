import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {navegadorScanner} from './portais.mjs'
import {orcamentoLote} from './orcamento.mjs'

test('orçamento para entre unidades antes do limite rígido e preserva a próxima',()=>{
 let agora=0,cursor=70
 const o=orcamentoLote({agora:()=>agora})
 while(o.podeIniciarUnidade()){cursor++;agora+=15000}
 assert.equal(cursor,83);assert.equal(agora,195000)
 assert.equal(o.podeIniciarUnidade(),false)
 // A mesma unidade ainda não concluída abre o próximo lote.
 assert.equal(orcamentoLote({agora:()=>agora}).podeIniciarUnidade(),true)
})

test('sessão: HTTP 429/503, encerramento externo e limite conservam causa e interrompem',async()=>{
 const server=createServer((req,res)=>{res.writeHead(Number(req.url.slice(1))||200,{'Content-Type':'text/html'});res.end('<p>fixture local</p>')})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const base='http://127.0.0.1:'+server.address().port
 try{
  for(const status of [429,503]){
   const s=await navegadorScanner(new AbortController().signal,[base])
   try{
    await s.page.goto(base+'/'+status).catch(()=>{})
    assert.throws(()=>s.assertDisponivel(),e=>e.code==='SCANNER_PORTAL_INDISPONIVEL'&&e.message.includes(String(status)))
    assert.equal(s.podeIniciarUnidade(),false)
   }finally{await s.close()}
  }
  const c=new AbortController(),s=await navegadorScanner(c.signal,[base])
  try{c.abort();assert.throws(()=>s.assertDisponivel(),{code:'SCANNER_LIMITE'})}finally{await s.close()}
  const t=await navegadorScanner(new AbortController().signal,[base])
  try{
   for(let n=0;n<93;n++)await t.page.goto(base+'/200')
   assert.equal(t.podeIniciarUnidade(),false)
   t.assertDisponivel() // parada preventiva; ainda não houve falha ou fechamento.
   await t.context.browser().close()
   assert.throws(()=>t.assertDisponivel(),{code:'SCANNER_SESSAO_INTERROMPIDA'})
  }finally{await t.close()}
 }finally{await new Promise(resolve=>server.close(resolve))}
})
