import { randomUUID } from 'node:crypto'
import { createWorkerFetch } from '../agente-automatico/worker-fetch.mjs'
import { createClient } from '@supabase/supabase-js'
import { mkdir, open, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { abrirLello } from './lello.mjs'
import { evidencia, janelaNoturna, validarConfiguracao } from './core.mjs'
import { portalOcupado } from './carga.mjs'
import { enriquecerPendentes,contatoPrincipal } from './cadastros.mjs'
import { abrirManager } from './manager.mjs'
import { abrirWebware } from './webware.mjs'
import { conciliarPendentes } from './conciliacao.mjs'
import { analisarPendentes } from './interpretacao-worker.mjs'
import {concluirComRetomada,checkpointLote} from './finalizacao.mjs'

// O processo só abre navegador após obter uma reserva persistida no banco.
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Configure o acesso administrativo do scanner ao Supabase.')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
 global: { fetch: createWorkerFetch() }, auth: { persistSession: false, autoRefreshToken: false },
})
async function tick() {
 const manualToken=process.argv.find(a=>a.startsWith('--manual-token='))?.slice('--manual-token='.length)
 if(manualToken&&!/^[0-9a-f-]{36}$/i.test(manualToken))throw Error('Token manual inválido.')
 if(manualToken&&!process.argv.includes('--once'))throw Error('Execução manual exige --once.')
 if (!janelaNoturna()&&!manualToken) return
 if(!manualToken){
 const cadastros=await enriquecerPendentes(db,20)
 if(cadastros.analisados||cadastros.pendentes)console.log(JSON.stringify({cadastros}))
 // Uma falha de conferência não monopoliza nem interrompe as consultas dos portais.
 try{const conciliacao=await conciliarPendentes(db,20);if(conciliacao.evidencias||conciliacao.erros)console.log(JSON.stringify({conciliacao}))}
 catch(error){console.error(JSON.stringify({conciliacao_status:'retomada_pendente',motivo:error.message}))}
 try{const analise=await analisarPendentes();if(analise.analisadas)console.log(JSON.stringify({interpretacao:analise}))}
 catch(error){console.error(JSON.stringify({interpretacao_status:'adiada',codigo:error.code??'SCANNER_IA_CONEXAO',http:error.http??null,motivo:'Análise assistida indisponível; coleta preservada.'}))}
 }
 if (await portalOcupado(db)) {console.log(JSON.stringify({scanner_status:'adiado',motivo:'coletor_operacional_em_execucao'}));return}
 const token = manualToken??randomUUID()
 const { data, error } = await db.rpc('scanner_reivindicar', { p_token: token })
 if (error) throw Error('Não foi possível reservar o scanner. Confira a migração e o banco.')
 const config = data?.[0]
 if (!config) {console.log(JSON.stringify({scanner_status:'aguardando',motivo:'pausa_global_reserva_ou_sem_elegiveis'}));return}
 let manual=null
 if(manualToken){
  const {data:m,error:me}=await db.from('scanner_lotes_manuais').select('token,configuracao_id,iniciado_em,expira_em,unidades').eq('token',token).single()
  if(me||!m?.iniciado_em)throw Error('Autorização manual não confirmada pelo banco.')
  manual=m
 }
 config.portal ??= 'lello'
 console.log(JSON.stringify({scanner:config.id,portal:config.portal,evento:'lote_inicio',cursor:config.cursor,limite_unidades:20}))
 let portal, lock, cursor = config.cursor, falhou = false, etapa='abrir', unidadeAtual=null, diagnostico=null
 const lockPath = config.portal==='manager'
   ? path.join(os.homedir(),'Downloads','manager-acordos','.manager-acordos.lock')
   : path.join(os.homedir(),'Downloads','acordos-portais',`.${config.portal}-acordos.lock`)
 const evidencias = [], controller = new AbortController()
 const timeout = setTimeout(() => controller.abort(), 240_000)
 try {
   const unidades = validarConfiguracao(config)
   // Compartilha a trava dos coletores de PDFs/recebimentos Lello.
   await mkdir(path.dirname(lockPath), { recursive: true })
   lock = await open(lockPath, 'wx')
   await lock.writeFile(JSON.stringify({ pid: process.pid, iniciado_em: new Date().toISOString(), scanner: true }))
   const options={...config,onStage:value=>{etapa=value}}
   if(config.portal==='lello')portal = await abrirLello(options, controller.signal)
   else {
     const {data:receita,error:re}=await db.from('agente_receitas').select('config_json,script_key,carteira_id').eq('id',config.receita_id).single()
     if(re || receita.config_json.condominio_id!==config.condominio_id)throw Error('Receita não corresponde ao condomínio do scanner.')
     const {data:condo,error:ce}=await db.from('condominios').select('carteira_id').eq('id',config.condominio_id).eq('status','ativo').single()
     if(ce)throw Error('Condomínio ativo não confirmado.')
     const {data:alvos,error:ue}=await db.from('unidades').select('id,identificacao,bloco').eq('condominio_id',config.condominio_id).eq('carteira_id',condo.carteira_id).in('id',unidades)
     if(ue||alvos.length!==unidades.length)throw Error('Unidades do lote não correspondem ao condomínio e à carteira.')
     if(config.portal==='bbz'){
       const {data:acordos,error:ae}=await db.from('acordos').select('unidade_id').eq('condominio_id',config.condominio_id).eq('carteira_id',condo.carteira_id).in('unidade_id',unidades).limit(2000)
       if(ae)throw Error('Não foi possível conferir as unidades com acordo para consulta BBZ.')
       options.unidadesComAcordo=[...new Set(acordos.map(a=>a.unidade_id))]
     }
     portal=await (config.portal==='manager'?abrirManager:abrirWebware)(options,receita.config_json,alvos,controller.signal)
   }
   for (const unidade of unidades) {
     unidadeAtual=unidade
     if ((!manual&&!janelaNoturna()) || (manual&&Date.now()>=Date.parse(manual.expira_em)) || controller.signal.aborted) break
     if (await portalOcupado(db)) break
     const { data: atual, error: atualErro } = await db.from('scanner_configuracoes').select('ativo').eq('id',config.id).single()
     if (atualErro) throw Error('Não foi possível conferir a pausa do scanner.')
     if (!atual.ativo) break
     const resultado = await portal.coletar(unidade)
     for (const tipo of ['contatos', 'pagamentos']) evidencias.push(evidencia(unidade, tipo, resultado[tipo]))
     cursor++
   }
 } catch (error) {
   const limiteComProgresso = (controller.signal.aborted || error.code==='SCANNER_LIMITE') && cursor > config.cursor
   falhou = error.code !== 'EEXIST' && !limiteComProgresso
   let motivo=String(error.message).split('\n')[0]
   for(const [key,value]of Object.entries(process.env))if(/^(SCANNER|AGENTE)_.*_(USUARIO|SENHA)$/.test(key)&&value)motivo=motivo.replaceAll(value,'[protegido]')
   diagnostico={etapa,unidade:unidadeAtual,motivo:motivo.slice(0,300),falhou}
   console.error(JSON.stringify({scanner:config.id,portal:config.portal,...diagnostico}))
 }
 finally {
   clearTimeout(timeout); await portal?.close().catch(() => {})
   if (lock) { await lock.close(); await unlink(lockPath) }
 }
 const iniciadoPersistencia=new Date(Date.now()-5000).toISOString()
 const dbFinal=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{
  global:{fetch:createWorkerFetch({timeoutMs:12000,maxConcurrent:2})},auth:{persistSession:false,autoRefreshToken:false},
 })
 const persistencia=await concluirComRetomada({
  parametros:{p_token:token,p_cursor:cursor,p_evidencias:evidencias,p_erro:falhou},...checkpointLote(token),
  // Canal novo e limitado: a falha de consulta de carga não bloqueia a gravação do lote já coletado.
  gravar:parametros=>dbFinal().rpc('scanner_concluir',parametros),
  confirmar:async()=>{
   const check=dbFinal()
   const [cfg,es]=await Promise.all([
    check.from('scanner_configuracoes').select('cursor').eq('id',config.id).single(),
    check.from('scanner_evidencias').select('unidade_portal,tipo,sha256').eq('configuracao_id',config.id).gte('observado_em',iniciadoPersistencia).limit(40),
   ])
   return !cfg.error&&!es.error&&cfg.data.cursor===(cursor===config.unidades.length?0:cursor)
    &&evidencias.every(e=>es.data.some(x=>x.unidade_portal===e.unidade_portal&&x.tipo===e.tipo&&x.sha256===e.sha256))
  },
 })
 if(persistencia.tentativas>1||persistencia.resposta_recuperada)console.log(JSON.stringify({scanner:config.id,persistencia}))
 const contatosConfirmados=evidencias.filter(e=>{
  if(e.tipo!=='contatos')return false
  try{contatoPrincipal(e.dados,e.unidade_portal);return true}catch{return false}
 }).length
 if(contatosConfirmados){
   const {error:ve}=await db.from('scanner_configuracoes').update({situacao:'validado'}).eq('id',config.id)
   if(ve)console.error('Não foi possível registrar a validação do acesso.')
 }
 if(cursor>config.cursor && !diagnostico){
   const contatos=contatosConfirmados
   const inconclusivos=evidencias.filter(e=>e.tipo==='pagamentos'&&e.dados.status==='inconclusivo').length
   const {error:resumoErro}=await db.from('scanner_configuracoes').update({ultimo_resultado:`${cursor-config.cursor} unidades consultadas; ${contatos} fichas de responsáveis, ${cursor-config.cursor-contatos} vínculos para revisão e ${inconclusivos} históricos financeiros inconclusivos. Cadastros seguem para aplicação automática auditada.`}).eq('id',config.id)
   if(resumoErro)console.error('Não foi possível registrar o resumo cadastral do lote.')
 }
 if(diagnostico){
   const {error:de}=await db.from('scanner_configuracoes').update({ultimo_resultado:`${diagnostico.etapa} · unidade ${diagnostico.unidade??'—'}: ${diagnostico.motivo}`}).eq('id',config.id)
   if(de)console.error('Não foi possível persistir o diagnóstico do lote.')
 }
 console.log(JSON.stringify({ scanner: config.id, portal:config.portal, unidades: cursor - config.cursor, evidencias: evidencias.length, falhou }))
 if(manual){
  try{console.log(JSON.stringify({conciliacao_manual:await conciliarPendentes(db,20,manual)}))}
  finally{
   const {error:fe}=await db.from('scanner_lotes_manuais').update({encerrado_em:new Date().toISOString()}).eq('token',token)
   if(fe)throw Error('Não foi possível encerrar o lote manual; autorização expira automaticamente.')
  }
 }
}
do {
 try { await tick() } catch (error) {
   console.error(error.message)
   if (process.argv.includes('--once')) process.exitCode = 1
 }
 if (process.argv.includes('--once')) break
 await new Promise(resolve => setTimeout(resolve, 60_000))
} while (true)
