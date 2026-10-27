import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { abrirLello } from './lello.mjs'
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const ids=process.argv.slice(2)
if(!ids.length)throw Error('Informe os IDs dos scanners para diagnosticar.')
const {data,error}=await db.from('scanner_configuracoes').select('*').in('id',ids)
if(error)throw Error('Não foi possível carregar os scanners.')
const resultados=[]
for(const config of data){
 let etapa='abrir',portal
 const unidade=config.unidades[config.cursor],controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180_000)
 try{
  portal=await abrirLello({...config,onStage:value=>{etapa=value}},controller.signal)
  const dados=await portal.coletar(unidade)
  resultados.push({id:config.id,cursor:config.cursor,unidade,etapa,status:'ok',pagamentos:dados.pagamentos.status||'interpretados'})
 }catch(error){
  let motivo=String(error.message)
  for(const [key,value]of Object.entries(process.env))if(/^SCANNER_.*_(USUARIO|SENHA)$/.test(key)&&value)motivo=motivo.replaceAll(value,'[protegido]')
  resultados.push({id:config.id,cursor:config.cursor,unidade,etapa,status:'falha',motivo:motivo.slice(0,1200)})
 }finally{clearTimeout(timer);await portal?.close().catch(()=>{})}
 console.log(JSON.stringify(resultados.at(-1)))
 await new Promise(r=>setTimeout(r,3000))
}
await mkdir('.local/scanner',{recursive:true})
await writeFile('.local/scanner/diagnostico-retomada.json',JSON.stringify(resultados,null,2))
