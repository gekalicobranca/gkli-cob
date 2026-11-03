import {createClient} from '@supabase/supabase-js'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {sendSmtpEmail} from '../../features/mensageria/email-provider'
import {EmailAdiadoError} from '../../features/mensageria/email-agenda'
import {ocorrenciasFinanceiras,ocorrenciasAcordosGraiche,montarRelatorio,REMETENTE_RELATORIO,COPIA_RELATORIO} from './relatorios-modelo.mjs'

const db=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
 global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})},auth:{persistSession:false,autoRefreshToken:false}})
const dados=async(q:any)=>{const r=await q;if(r.error)throw Error('Consulta do relatório falhou: '+(r.error.code??'banco'));return r.data}
const detalheErro=(e:any)=>String(e.message??e).slice(0,250).replaceAll(process.env.COBRANCA_OUTLOOK_PASSWORD||'\u0000','[protegido]')

async function contexto(configuracao:string){
 const client=db(),config=await dados(client.from('scanner_configuracoes').select('id,portal,condominio_id').eq('id',configuracao).single())
 const condo=await dados(client.from('condominios').select('id,nome,carteira_id,operador_id').eq('id',config.condominio_id).single())
 const carteira=await dados(client.from('carteiras').select('operador_id').eq('id',condo.carteira_id).single())
 return {config,condo,operadorPadrao:condo.operador_id??carteira.operador_id??null}
}

async function agrupar(ctx:any,itens:any[],resumo:any,consultadoEm:string){
 const client=db(),ids=(campo:string)=>[...new Set(itens.map(i=>i[campo]).filter(Boolean))]
 const [acordos,cobrancas,unidades]=await Promise.all([
  ids('acordo_id').length?dados(client.from('acordos').select('id,tipo,operador_id,unidade_id').eq('condominio_id',ctx.condo.id).eq('carteira_id',ctx.condo.carteira_id).in('id',ids('acordo_id'))):[],
  ids('cobranca_id').length?dados(client.from('cobrancas').select('id,operador_id,unidade_id').eq('condominio_id',ctx.condo.id).eq('carteira_id',ctx.condo.carteira_id).in('id',ids('cobranca_id'))):[],
  dados(client.from('unidades').select('id,identificacao,bloco').eq('condominio_id',ctx.condo.id).eq('carteira_id',ctx.condo.carteira_id).limit(1000)),
 ])
 const mapaA=new Map(acordos.map((x:any)=>[x.id,x])),mapaC=new Map(cobrancas.map((x:any)=>[x.id,x])),mapaU=new Map(unidades.map((x:any)=>[x.id,x]))
 const grupos=new Map<string,any>(),vistos=new Set<string>()
 for(const i of itens){
  const acordo:any=mapaA.get(i.acordo_id),cobranca:any=mapaC.get(i.cobranca_id)
  if(acordo?.tipo==='judicial')continue
  if(i.acordo_id&&!acordo||i.cobranca_id&&!cobranca)throw Error('Item fora do condomínio do relatório.')
  const uid=acordo?.unidade_id??cobranca?.unidade_id??i.unidade_id,unidade:any=mapaU.get(uid)
  if(uid&&!unidade)throw Error('Unidade fora da carteira do relatório.')
  const op=acordo?.operador_id??cobranca?.operador_id??ctx.operadorPadrao,chave=op??'sem-operador'
  const identidade=[i.acordo_id??i.cobranca_id??i.item_id??uid,i.categoria,i.motivo,i.app,i.portal].join('|')
  if(vistos.has(identidade))continue;vistos.add(identidade)
  if(!grupos.has(chave))grupos.set(chave,{operador_id:op,itens:[]})
  grupos.get(chave).itens.push({...i,unidade:unidade?.identificacao??i.unidade??'não identificada',bloco:unidade?.bloco??i.bloco??'0'})
 }
 if(!grupos.size)grupos.set(ctx.operadorPadrao??'sem-operador',{operador_id:ctx.operadorPadrao,itens:[]})
 const operadores=[...grupos.values()].map(g=>g.operador_id).filter(Boolean)
 const perfis=operadores.length?await dados(client.from('profiles').select('id,nome').in('id',operadores)):[]
 return [...grupos.values()].map(g=>{
  if(g.itens.length>100)throw Error('Relatório acima de 100 ocorrências; reduzir lote antes do envio.')
  const responsavel=perfis.find((p:any)=>p.id===g.operador_id)?.nome??'Sem responsável atribuído — revisão pela Edi'
  const render=montarRelatorio({condominio:ctx.condo.nome,portal:ctx.config.portal,consultadoEm,responsavel,itens:g.itens,resumo})
  return {...g,resumo:{...resumo,condominio:ctx.condo.nome,portal:ctx.config.portal,consultado_em:consultadoEm,responsavel},...render}
 })
}

export async function registrarManual(arquivo:string){
 const entrada=JSON.parse(await readFile(arquivo,'utf8')),ctx=await contexto(entrada.configuracao_id)
 const grupos=await agrupar(ctx,entrada.itens,entrada.resumo??{},entrada.consultado_em)
 const registros=[]
 for(const g of grupos){
  const id=await dados(db().rpc('scanner_registrar_relatorio_email',{p_chave:entrada.chave+':'+(g.operador_id??'sem-operador'),p_configuracao:ctx.config.id,p_lote:null,p_operador:g.operador_id,p_assunto:g.assunto,p_texto:g.texto,p_itens:g.itens,p_resumo:g.resumo}))
  const pasta=path.resolve('.local/scanner-publicacao');await mkdir(pasta,{recursive:true})
  await writeFile(path.join(pasta,`relatorio-${id}.html`),g.html)
  await writeFile(path.join(pasta,`relatorio-${id}.txt`),g.texto)
  registros.push(id)
 }
 return registros
}

export async function prepararLotes({simular=false,desde=process.env.SCANNER_RELATORIOS_DESDE,limite=10}={}){
 if(!desde)return {preparados:0,aguardando:0}
 const client=db(),lotes=await dados(client.rpc('scanner_relatorios_lotes_pendentes',{p_desde:desde,p_limite:limite}))
 const resultado={preparados:0,aguardando:0,erros:0,simulacoes:[] as any[]}
 for(const lote of lotes){
  try{
  const obs=lote.observacoes??[],unidades=obs.map((x:any)=>x.unidade),ctx=await contexto(lote.configuracao_id)
  const ev=unidades.length?await dados(client.from('scanner_evidencias').select('id,unidade_portal,conciliacao_status,observado_em,dados').eq('configuracao_id',lote.configuracao_id).eq('tipo','pagamentos').in('unidade_portal',unidades).gte('observado_em',lote.iniciado_em).lte('observado_em',new Date(Date.parse(lote.concluido_em)+1000).toISOString()).limit(20)):[]
  const pendentes=ev.filter((e:any)=>e.conciliacao_status==='pendente').length+Math.max(0,unidades.length-ev.length)
  // Dá ao conciliador o próximo tick. Depois de 10min relata a limitação explicitamente.
  if(pendentes&&Date.now()-Date.parse(lote.concluido_em)<10*60000){resultado.aguardando++;continue}
  const evIds=ev.map((e:any)=>e.id)
  const [auditorias,rechecagens]=evIds.length?await Promise.all([
   dados(client.from('scanner_conciliacao_auditoria').select('evidencia_id,observado_em,unidade_id,itens').in('evidencia_id',evIds).gte('observado_em',lote.iniciado_em).lte('observado_em',new Date(Date.parse(lote.concluido_em)+1000).toISOString()).limit(20)),
   dados(client.from('scanner_rechecagens_pagos').select('evidencia_id,unidade_id,itens').in('evidencia_id',evIds).gte('conferido_em',lote.iniciado_em).lte('conferido_em',new Date(Date.parse(lote.concluido_em)+15*60000).toISOString()).limit(20)),
  ]):[[],[]]
  const resumo:any={unidades:unidades.length,sem_acesso:obs.filter((x:any)=>['sem_acesso','acesso_adiado'].includes(x.diagnostico)).length,parciais:obs.filter((x:any)=>x.parcial).length,conciliacoes_pendentes:pendentes,coleta_falhou:lote.falhou}
  resumo.cadastros_restritos=ev.filter((e:any)=>e.dados?.cadastro_status==='acesso_restrito').length
  const provas=[...auditorias,...rechecagens].map(a=>({...a,documentos_disponiveis:ev.some((e:any)=>e.id===a.evidencia_id&&(e.dados.recebimentos?.length||e.dados.pagamentos?.length))}))
  const acordosGraiche=ctx.config.portal==='graiche'&&unidades.length?await dados(client.from('acordos').select('id,unidade_id,tipo,status').eq('condominio_id',ctx.condo.id).eq('carteira_id',ctx.condo.carteira_id).eq('tipo','extrajudicial').in('unidade_id',unidades).in('status',['ativo','em_dia','em_atraso','vencido']).limit(101)):[]
  if(acordosGraiche.length>100)throw Error('Acordos acima do limite de relatório; revisão necessária.')
  if(ctx.config.portal==='graiche')resumo['origem']='Conferência do filtro de acordos disponível neste acesso, sem extrato financeiro e sem inferência de pagamento.'
  const grupos=await agrupar(ctx,[...ocorrenciasFinanceiras(provas),...ocorrenciasAcordosGraiche(ev,acordosGraiche)],resumo,lote.concluido_em)
  if(simular)resultado.simulacoes.push({lote:lote.token,relatorios:grupos.map(g=>({responsavel:g.resumo.responsavel,ocorrencias:g.itens.length,resumo:g.resumo}))})
  else await dados(client.rpc('scanner_registrar_relatorios_lote',{p_lote:lote.token,p_grupos:grupos.map(({html,...g})=>g)}))
  resultado.preparados++
  }catch(e){resultado.erros++;console.error(JSON.stringify({relatorio_lote:lote.token,status:'preparacao_pendente',motivo:detalheErro(e)}))}
 }
 return resultado
}

export async function enviarPendentes(limite=2){
 const client=db(),fila=await dados(client.from('scanner_relatorios_email').select('*').eq('estado','pendente').lte('proxima_tentativa',new Date().toISOString()).order('criado_em').limit(Math.min(limite,5)))
 const resultado={enviados:0,adiados:0,incertos:0,erros:0}
 if(!fila.length)return resultado
 if(process.env.COBRANCA_OUTLOOK_EMAIL?.trim().toLowerCase()!==REMETENTE_RELATORIO||!process.env.COBRANCA_OUTLOOK_PASSWORD)throw Error('Configure o acesso cobranca@gekali.com.br no ambiente local.')
 const config=await dados(client.from('integracoes_smtp_config').select('carteira_id,host,porta,usuario,remetente,secure,starttls,ehlo_domain').eq('ativo',true).eq('usuario',REMETENTE_RELATORIO).single())
 const smtp={host:config.host,port:config.porta,user:REMETENTE_RELATORIO,pass:process.env.COBRANCA_OUTLOOK_PASSWORD,from:config.remetente,secure:config.secure,starttls:config.starttls!==false,ehloDomain:config.ehlo_domain||'gkli.local'}
 for(const r of fila){
  const m=await dados(client.from('mensagens').select('id,status,agendada_para').eq('id',r.mensagem_id).single())
  if(m.status==='enviada'){await dados(client.from('scanner_relatorios_email').update({estado:'enviado',enviado_em:new Date().toISOString(),erro:null}).eq('id',r.id));continue}
  const tentativas=await dados(client.from('email_tentativas').select('id,estado,iniciado_em,finalizado_em').eq('mensagem_id',m.id).in('estado',['em_envio','incerto','enviado']).order('iniciado_em',{ascending:false}).limit(1))
  const confirmado=tentativas.find((t:any)=>t.estado==='enviado')
  if(confirmado){
   const em=confirmado.finalizado_em??new Date().toISOString()
   await dados(client.from('mensagens').update({status:'enviada',status_operacional:'enviada',sent_at:em,enviada_em:em}).eq('id',m.id))
   await dados(client.from('scanner_relatorios_email').update({estado:'enviado',enviado_em:em,erro:null}).eq('id',r.id));continue
  }
  const interrompida=tentativas.find((t:any)=>t.estado==='em_envio'&&Date.now()-Date.parse(t.iniciado_em)>10*60000)
  if(interrompida)await dados(client.rpc('email_finalizar_disparo',{p_tentativa:interrompida.id,p_estado:'incerto'}))
  if(interrompida||tentativas.some((t:any)=>t.estado==='incerto')){await dados(client.from('scanner_relatorios_email').update({estado:'incerto',erro:'Envio sem confirmação; verificar antes de reenviar.'}).eq('id',r.id));resultado.incertos++;continue}
  if(tentativas.length||Date.parse(m.agendada_para??'')>Date.now()){resultado.adiados++;continue}
  try{
   if(config.carteira_id!==r.carteira_envio_id||r.copia!==COPIA_RELATORIO)throw Error('Escopo do remetente ou cópia diverge do relatório autorizado.')
   const html=montarRelatorio({condominio:r.resumo.condominio,portal:r.resumo.portal,consultadoEm:r.resumo.consultado_em,responsavel:r.resumo.responsavel,itens:r.itens,resumo:r.resumo}).html
   await sendSmtpEmail({to:r.destinatario,cc:[r.copia],subject:r.assunto,text:r.texto,attachments:[{filename:'relatorio-scanner.html',contentType:'text/html; charset=utf-8',content:Buffer.from(html)}]},
    {carteiraId:r.carteira_envio_id,mensagemId:m.id,overrideConfig:smtp,copiarControleFlow:false})
   const agora=new Date().toISOString()
   await dados(client.from('mensagens').update({status:'enviada',status_operacional:'enviada',sent_at:agora,enviada_em:agora,erro:null,erro_envio:null}).eq('id',m.id))
   await dados(client.from('scanner_relatorios_email').update({estado:'enviado',enviado_em:agora,erro:null,tentativas:r.tentativas+1}).eq('id',r.id))
   resultado.enviados++
  }catch(e){
   if(e instanceof EmailAdiadoError){resultado.adiados++;continue}
   // O provedor registra incerto em falhas após transmitir DATA. Nunca repete automaticamente.
   const final=await dados(client.from('email_tentativas').select('estado').eq('mensagem_id',m.id).order('iniciado_em',{ascending:false}).limit(1))
   const incerto=final[0]?.estado==='incerto',aceito=final[0]?.estado==='enviado'
   if(aceito){await dados(client.from('scanner_relatorios_email').update({estado:'enviado',enviado_em:new Date().toISOString(),erro:'SMTP aceitou; conferir registro da mensagem.'}).eq('id',r.id));resultado.enviados++;continue}
   const tentativas=r.tentativas+1
   await dados(client.from('scanner_relatorios_email').update({estado:incerto?'incerto':tentativas<3?'pendente':'erro',erro:detalheErro(e),tentativas,proxima_tentativa:new Date(Date.now()+15*60000).toISOString()}).eq('id',r.id))
   if(incerto)resultado.incertos++;else resultado.erros++
  }
 }
 return resultado
}

export async function main(){
 if(process.env.SCANNER_RELATORIOS_EMAIL_ATIVO!=='true'&&!process.argv.includes('--manual'))return
 const arquivo=process.argv.indexOf('--manual')
 if(arquivo>=0)console.log(JSON.stringify({relatorios_registrados:await registrarManual(process.argv[arquivo+1])}))
 else console.log(JSON.stringify({relatorios_preparacao:await prepararLotes()}))
 console.log(JSON.stringify({relatorios_envio:await enviarPendentes()}))
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(detalheErro(e));process.exitCode=1})
