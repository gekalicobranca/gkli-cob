import { createClient } from '@supabase/supabase-js'
import { writeFile, mkdir } from 'node:fs/promises'
import { abrirLello } from './lello.mjs'
import { evidencia } from './core.mjs'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
// A identidade do condomínio está no config_json das receitas existentes.
const result = await db.from('agente_receitas').select('config_json').eq('script_key','captacao_lello').eq('ativo',true)
if (result.error) throw Error('Não foi possível consultar as receitas Lello.')
await mkdir('.local/scanner', { recursive: true })
const resumo=[]
for (const receita of result.data) {
 const c=receita.config_json
 if (!c?.condominio_id) continue
 const { data: condo, error: ce }=await db.from('condominios').select('id,nome,status,administradora').eq('id',c.condominio_id).single()
 const followConfirmado=condo?.id==='13290a44-ec8d-4232-81e7-711196547f91' && String(c.codigo_portal||c.codigo_cliente)==='62430' && condo.administradora?.toLowerCase()==='hubert/lello'
 if (ce || condo.status!=='ativo' || (condo.administradora.toLowerCase()!=='lello' && !followConfirmado)) continue
 const perfil=/safira/i.test(condo.nome)?'SAFIRA':/topazio/i.test(condo.nome)?'TOPAZIO':'PADRAO'
 if (process.env.SCANNER_BOOTSTRAP_PERFIL && process.env.SCANNER_BOOTSTRAP_PERFIL!==perfil) continue
 let etapa='abrir'
 const config={condominio_id:condo.id,codigo_portal:String(c.codigo_portal||c.codigo_cliente||''),perfil_acesso:perfil,onStage:value=>{etapa=value}}
 if(process.env.SCANNER_BOOTSTRAP_CODIGO && process.env.SCANNER_BOOTSTRAP_CODIGO!==config.codigo_portal)continue
 let portal
 const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),120_000)
 try {
  portal=await abrirLello(config,controller.signal)
  const unidades=portal.unidades()
  if (!unidades.length || unidades.length>1000) throw Error('Quantidade de unidades inválida.')
  await writeFile(`.local/scanner/${condo.id}.json`,JSON.stringify({...config,unidades},null,2))
  // Prova uma ficha e um histórico antes de habilitar o condomínio na fila.
  const coleta=await portal.coletar(unidades[0])
  const cadastro={condominio_id:config.condominio_id,codigo_portal:config.codigo_portal,perfil_acesso:config.perfil_acesso}
  const {error:e}=await db.from('scanner_configuracoes').upsert({...cadastro,unidades,ativo:true},{onConflict:'condominio_id',ignoreDuplicates:true})
  if(e)throw Error('Falha ao gravar configuração.')
  const {data:salvo,error:se}=await db.from('scanner_configuracoes').select('id').eq('condominio_id',condo.id).single()
  if(se)throw Error('Falha ao reler configuração.')
  const provas=['contatos','pagamentos'].map(tipo=>({...evidencia(unidades[0],tipo,coleta[tipo]),configuracao_id:salvo.id}))
  const {error:pe}=await db.from('scanner_evidencias').upsert(provas,{onConflict:'configuracao_id,unidade_portal,tipo,sha256',ignoreDuplicates:true})
  if(pe)throw Error('Falha ao persistir a prova de coleta.')
  resumo.push({condominio:condo.nome,unidades:unidades.length,status:'validado_ativo'})
 } catch (error) {
  let motivo=String(error.message).split('\n')[0]
  for(const [key,value] of Object.entries(process.env)) if(/^SCANNER_.*_(USUARIO|SENHA)$/.test(key)&&value)motivo=motivo.replaceAll(value,'[protegido]')
  resumo.push({condominio:condo.nome,status:'requer_validacao',etapa,motivo:motivo.slice(0,200)}); process.exitCode=1
 }
 finally {clearTimeout(timer);await portal?.close().catch(()=>{})}
 console.log(JSON.stringify(resumo.at(-1)))
 await new Promise(r=>setTimeout(r,3_000))
}
await writeFile('.local/scanner/bootstrap-resumo.json',JSON.stringify(resumo,null,2))
