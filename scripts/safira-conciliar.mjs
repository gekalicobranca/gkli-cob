import { createClient } from '@supabase/supabase-js'
import { readFile,writeFile,mkdir,readdir } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { SAFIRA,CARTEIRA,homologarSafira,hash } from './acordos-portais/safira-homologacao.mjs'
const [comando,pastaInput]=process.argv.slice(2),pasta=path.resolve(pastaInput||'.codex-tmp/safira-homologacao')
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY
const db=()=>{if(!url||!secret)throw Error('Ambiente do banco ausente.');return createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})}
const salvar=async(nome,dados)=>writeFile(path.join(pasta,nome),JSON.stringify(dados,null,2))
async function snapshot(){
 const banco=db()
 const {data:acordos,error}=await banco.from('acordos').select('id,condominio_id,carteira_id,unidade_id,status,tipo,valor_acordado,updated_at,unidade:unidades(id,identificacao,acao_judicial),parcelas:parcelas_acordo(id,numero,tipo_parcela,vencimento,valor,status,data_pagamento,updated_at)')
 .eq('condominio_id',SAFIRA).eq('carteira_id',CARTEIRA).order('id').limit(1000)
 if(error||!acordos||acordos.length===1000)throw Error('Snapshot de acordos indisponível ou truncado.')
 const {data:casos,error:ec}=await banco.from('central_pendencias').select('payload').eq('condominio_id',SAFIRA).not('status','in','(resolvida,cancelada)').limit(1000)
 if(ec||casos?.length===1000)throw Error('Não foi possível verificar prioridade humana.')
 const humanos=[...new Set((casos??[]).filter(c=>c.payload?.estado==='atendimento_humano').flatMap(c=>c.payload.unidade_ids??[]))]
 const {data:links,error:el}=await banco.from('acordo_cobrancas').select('acordo_id,cobranca:cobrancas(status_operacional,automacao_bloqueada)').in('acordo_id',acordos.map(a=>a.id)).limit(1000)
 if(el||links?.length===1000)throw Error('Não foi possível verificar bloqueios das cobranças.')
 for(const a of acordos)a.bloqueado=(links??[]).some(l=>l.acordo_id===a.id&&(l.cobranca?.automacao_bloqueada||['suspenso','judicializado'].includes(l.cobranca?.status_operacional)))
 return {consultado_em:new Date().toISOString(),humanos,acordos}
}
async function fontes(){
 const rows=[]
 for(const unidade of await readdir(path.join(pasta,'coletas'))){
  try{
   const dir=path.join(pasta,'coletas',unidade),raw=JSON.parse(await readFile(path.join(dir,'recebimentos.json'),'utf8'))
   if(raw.agente!=='lello_recebimentos_safira'||raw.codigo!=='63004'||raw.unidade!==unidade)throw Error('Escopo da fonte divergente.')
   for(const doc of raw.documentos){if(path.basename(doc.arquivo)!==doc.arquivo||hash(await readFile(path.join(dir,doc.arquivo),'utf8'))!==doc.sha256)throw Error('Evidência alterada.')}
   rows.push({...raw,diretorio:dir})
  }catch(e){if(e.code!=='ENOENT')throw e}
 }
 return rows
}
async function main(){
 if(!comando||comando==='--help'){console.log('safira-conciliar.mjs preparar|coletar|homologar|registrar|baixar <pasta>. Preparar/coletar/homologar não alteram pagamentos. Registrar grava vínculos; baixar confirma somente recebimentos novos de vínculos homologados.');return}
 if(!pastaInput)throw Error('Informe uma pasta explícita da rodada.')
 await mkdir(pasta,{recursive:true})
 if(comando==='preparar'){const s=await snapshot();await salvar('snapshot.json',s);console.log(JSON.stringify({acordos:s.acordos.length,unidades:[...new Set(s.acordos.filter(a=>['ativo','em_dia','em_atraso','vencido'].includes(a.status)).map(a=>a.unidade.identificacao))].length}));return}
 if(comando==='coletar'){
  await mkdir(path.join(pasta,'coletas'),{recursive:false})
  const s=await snapshot();await salvar('snapshot.json',s)
  const unidades=[...new Set(s.acordos.filter(a=>['ativo','em_dia','em_atraso','vencido'].includes(a.status)).map(a=>a.unidade.identificacao))].sort()
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/SUPABASE|SECRET|TOKEN/i.test(k))),falhas=[]
  for(const [i,u] of unidades.entries()){
   const dir=path.join(pasta,'coletas',u)
   try{await promisify(execFile)(process.execPath,['scripts/acordos-portais/lello-recebimentos.mjs','--unidade',u,'--saida',dir],{env,windowsHide:true,timeout:180000,maxBuffer:1024*1024});console.log(JSON.stringify({unidade:u,estado:'coletada',progresso:`${i+1}/${unidades.length}`}))}
   catch{falhas.push(u);console.log(JSON.stringify({unidade:u,estado:'revisao_coleta'}))}
  }
  await salvar('falhas-coleta.json',falhas);return
 }
 if(!['homologar','registrar','baixar'].includes(comando))throw Error('Comando inválido.')
 const plano=homologarSafira(await snapshot(),await fontes());await salvar('homologacao.json',plano)
 const banco=comando==='homologar'?null:db(),resultados=[]
 for(const item of plano.filter(p=>p.homologavel)){
  if(!banco)continue
  const bytes=await readFile(path.join(item.fonte.diretorio,item.fonte.documentos.find(d=>d.acordo===item.acordo_externo&&!d.recibo).arquivo))
  const sha=hash(bytes.toString('utf8')),storagePath=`safira/${sha}.html`
  const upload=await banco.storage.from('lello-evidencias').upload(storagePath,bytes,{contentType:'text/plain',upsert:false})
  if(upload.error&&!/already exists|duplicate/i.test(upload.error.message))throw Error('Falha ao preservar evidência privada.')
  const {data:vinculo,error}=await banco.rpc('safira_homologar_lello',{p_acordo:item.acordo_id,p_externo:item.acordo_externo,p_unidade:item.unidade,p_cronograma:item.cronograma,p_sha:sha,p_path:storagePath,p_consultado:item.fonte.consultado_em})
  if(error)throw error
  resultados.push({acordo_id:item.acordo_id,vinculo})
  await salvar(`resultado-${comando}.json`,resultados)
  if(comando==='baixar')for(const p of item.pagamentos.filter(p=>p.resultado==='novo_recebimento')){
   const r=p.recibo,doc=item.fonte.documentos.find(d=>d.arquivo===r.documento)
   const bytesRecibo=await readFile(path.join(item.fonte.diretorio,doc.arquivo)),shaRecibo=hash(bytesRecibo.toString('utf8')),pathRecibo=`safira/${shaRecibo}.html`
   const u=await banco.storage.from('lello-evidencias').upload(pathRecibo,bytesRecibo,{contentType:'text/plain',upsert:false})
   if(u.error&&!/already exists|duplicate/i.test(u.error.message))throw Error('Falha ao preservar recibo.')
   const {data,error:e}=await banco.rpc('safira_baixar_lello',{p_vinculo:vinculo,p_parcela:p.parcela_id,p_recibo:r.recibo_consultado,p_parcela_externa:r.parcela_externa,p_numero:r.numero,p_vencimento:r.vencimento,p_valor:r.valor_pago_centavos,p_data:r.data_pagamento,p_sha:shaRecibo,p_path:pathRecibo,p_consultado:item.fonte.consultado_em})
   if(e)throw e;resultados.push({parcela_id:p.parcela_id,resultado:data});await salvar(`resultado-${comando}.json`,resultados)
  }
 }
 await salvar(`resultado-${comando}.json`,resultados)
 if(comando==='baixar')await promisify(execFile)(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/safira-publicar-resumo.ts',pasta],{windowsHide:true,timeout:60000,maxBuffer:1024*1024})
 const resumo={acordos_fontes:plano.length,homologaveis:plano.filter(p=>p.homologavel).length,revisao:plano.filter(p=>!p.homologavel).length,pagamentos:plano.flatMap(p=>p.pagamentos).reduce((s,p)=>(s[p.resultado]=(s[p.resultado]??0)+1,s),{}),operacoes:resultados.length}
 console.log(JSON.stringify(resumo))
}
main().catch(e=>{console.error(e?.message??'Conciliação interrompida.');process.exitCode=1})
