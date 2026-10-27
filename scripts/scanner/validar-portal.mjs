// Diagnóstico explícito de UMA unidade. Não altera cadastros, cursores nem filas de captação.
import {createClient} from '@supabase/supabase-js'
import {abrirManager} from './manager.mjs'
import {abrirWebware} from './webware.mjs'
import {contatoPrincipal} from './cadastros.mjs'
import {createWorkerFetch} from '../agente-automatico/worker-fetch.mjs'
const portal=process.argv[2],condominio=process.argv[3]
const scripts={manager:'manager_atentum_cotas_pendentes',bbz:'bbz_condopro_clock_vila_romana',graiche:'captacao_graiche',sell:'captacao_sell'}
if(!scripts[portal])throw Error('Informe manager, bbz, graiche ou sell e, opcionalmente, o UUID do condomínio.')
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{global:{fetch:createWorkerFetch()},auth:{persistSession:false}})
const {data:receitas,error}=await db.from('agente_receitas').select('id,carteira_id,config_json').eq('script_key',scripts[portal])
if(error)throw Error('Não foi possível consultar os acessos.')
const receita=receitas.find(r=>(!condominio||r.config_json.condominio_id===condominio)&&!r.config_json.coleta_segmentada)
if(!receita)throw Error('Receita não segmentada indisponível.')
const {data:c,error:ce}=await db.from('condominios').select('id,nome,status,carteira_id').eq('id',receita.config_json.condominio_id).single()
if(ce||c.status!=='ativo')throw Error('Condomínio ativo não confirmado.')
const {data:unidades,error:ue}=await db.from('unidades').select('id,identificacao,bloco').eq('condominio_id',c.id).eq('carteira_id',c.carteira_id).order('identificacao').limit(1000)
if(ue||!unidades.length)throw Error('Unidades não disponíveis.')
const config={diagnostico:true,condominio_id:c.id,portal,codigo_portal:portal==='manager'?receita.config_json.codigo_cliente:'0',onStage:etapa=>console.log(JSON.stringify({portal,etapa}))}
const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),180_000)
let sessao
try{
 sessao=await(portal==='manager'?abrirManager:abrirWebware)(config,receita.config_json,unidades,controller.signal)
 // A primeira unidade da carteira é consultada sem escolher um responsável conhecido.
 for(const unidade of unidades.slice(0,process.argv.includes('--duas')?2:1)){
  const id=unidade.id,r=await sessao.coletar(id)
  const contato=contatoPrincipal(r.contatos,id)
  console.log(JSON.stringify({portal,condominio:c.nome,condominio_id:c.id,unidade_id:id,ok:true,com_email:!!contato.email,com_telefone:!!contato.telefone,pagamentos_status:r.pagamentos.status,pagamentos_motivo:r.pagamentos.motivo,referencia_portal:r.pagamentos.referencia_portal,pagamentos:r.pagamentos.pagamentos?.length??0}))
 }
}catch(e){console.error(JSON.stringify({portal,condominio:c.nome,ok:false,erro:e.message.split('\n')[0].slice(0,200)}));process.exitCode=1}
finally{clearTimeout(timeout);await sessao?.close().catch(()=>{})}
