import {renderizarRevisaoQuebrados} from './revisao-quebrados-html.mjs'
import {createClient} from '@supabase/supabase-js'
import {writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
import {createWorkerFetch} from '../agente-automatico/worker-fetch.mjs'
import {excluirPiqueri,PIQUERI,revisarAcordo,resumirRevisao} from './revisao-quebrados-modelo.mjs'

// Exportador somente leitura: nenhuma RPC, importação, navegador, e-mail ou flow.
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{global:{fetch:createWorkerFetch({timeoutMs:20000,maxConcurrent:1})},auth:{persistSession:false,autoRefreshToken:false}})
async function ler(tabela,colunas,filtro=q=>q,ordem='id'){
 const xs=[]
 for(let n=0;n<40;n++){
  const {data,error}=await filtro(db.from(tabela).select(colunas)).order(ordem).range(n*500,n*500+499)
  if(error)throw Error('Leitura incompleta de '+tabela+'; relatório não gerado: '+error.code)
  xs.push(...data);if(data.length<500)return xs
 }
 throw Error('Leitura excedeu limite seguro de '+tabela+'; nenhuma conclusão parcial gerada.')
}
async function porIds(tabela,colunas,campo,ids,extra=q=>q,ordem='id'){
 const out=[],unicos=[...new Set(ids.filter(Boolean))]
 for(let n=0;n<unicos.length;n+=80)out.push(...await ler(tabela,colunas,q=>extra(q.in(campo,unicos.slice(n,n+80))),ordem))
 return out
}
const acordos=await ler('acordos','id,carteira_id,condominio_id,unidade_id,cobranca_id,tipo,status,numero_processo,valor_acordado,quantidade_parcelas,observacoes,observacao_operacional,quebra_confirmacao,updated_at',q=>q.in('status',['quebrado','rompido']).neq('condominio_id',PIQUERI))
const condos=await porIds('condominios','id,nome,administradora,carteira_id,status','id',acordos.map(a=>a.condominio_id))
const permitidos=acordos.filter(a=>!excluirPiqueri(condos.find(c=>c.id===a.condominio_id)))
const unidades=await porIds('unidades','id,identificacao,bloco,condominio_id,carteira_id','id',permitidos.map(a=>a.unidade_id))
const parcelas=await porIds('parcelas_acordo','id,acordo_id,numero,valor,vencimento,status,data_pagamento,observacoes,tipo_parcela,valor_original_reemissao,vencimento_original_reemissao,reemitida_em','acordo_id',permitidos.map(a=>a.id))
const relacoes=await porIds('acordo_cobrancas','acordo_id,cobranca_id','acordo_id',permitidos.map(a=>a.id))
const cotas=await porIds('cobrancas','id,unidade_id,condominio_id,carteira_id,competencia,vencimento,valor_original,valor_atualizado,status,status_operacional,status_financeiro,observacoes,data_pagamento,valor_pago,duplicada_de_id,arquivada_em,automacao_bloqueada','unidade_id',permitidos.map(a=>a.unidade_id))
const fontes=await porIds('acordos_fontes_lello','acordo_id,numero_acordo,unidade_id,condominio_id,carteira_id,fonte_json,criado_em','acordo_id',permitidos.map(a=>a.id),q=>q,'acordo_id')
const baixas=await porIds('scanner_baixas','id,acordo_id,unidade_id,condominio_id,carteira_id,recibo,data_pagamento,valor_pago_centavos,portal,confirmado_por,observado_em,evidencia_sha256','acordo_id',permitidos.map(a=>a.id))
const configs=await porIds('scanner_configuracoes','id,condominio_id,ativo,situacao,portal,unidades,cursor','condominio_id',permitidos.map(a=>a.condominio_id))
const referencias=[...permitidos.map(a=>a.unidade_id),...fontes.map(f=>f.fonte_json?.unidade)]
const evidencias=await porIds('scanner_evidencias','id,configuracao_id,unidade_portal,observado_em,sha256,dados','unidade_portal',referencias,q=>q.eq('tipo','pagamentos').gte('observado_em',new Date(Date.now()-7*86400000).toISOString()))
const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())
const casos=permitidos.map(a=>{
 const cfgs=configs.filter(c=>c.condominio_id===a.condominio_id),refs=fontes.filter(f=>f.acordo_id===a.id&&f.unidade_id===a.unidade_id&&f.condominio_id===a.condominio_id&&f.carteira_id===a.carteira_id).map(f=>f.fonte_json?.unidade).filter(Boolean)
 const es=evidencias.filter(e=>cfgs.some(c=>c.id===e.configuracao_id)&&(e.unidade_portal===a.unidade_id||refs.includes(e.unidade_portal)))
 const r=revisarAcordo({acordo:a,condominio:condos.find(c=>c.id===a.condominio_id),unidade:unidades.find(u=>u.id===a.unidade_id),parcelas:parcelas.filter(p=>p.acordo_id===a.id),cotas,relacoes,fontes,baixas,evidencias:es,hoje})
 r.scanner={configuracoes:cfgs.map(c=>({id:c.id,portal:c.portal,ativo:c.ativo,situacao:c.situacao,unidade_incluida:c.unidades.includes(a.unidade_id)||refs.some(u=>c.unidades.includes(u))})),ultima_evidencia:es.map(e=>e.observado_em).sort().at(-1)??null}
 return r
}).filter(Boolean).sort((a,b)=>a.condominio.localeCompare(b.condominio)||String(a.bloco).localeCompare(String(b.bloco))||String(a.unidade).localeCompare(String(b.unidade),undefined,{numeric:true}))
const relatorio={versao:1,consultado_em:new Date().toISOString(),fuso:'America/Sao_Paulo',modo:'levantamento_somente_leitura_app',portais_consultados:0,piqueri_excluido:true,limite_portais_por_lote:20,resumo:resumirRevisao(casos),alteracoes_realizadas:[],limitacoes:['Situação e saldo residual da administradora ainda não conferidos por este levantamento.','Nenhuma nova quebra, reclassificação, baixa, vínculo, liberação, cobrança, mensagem ou flow realizado.','Pagamentos marcados no app podem ter datas estimadas; não são automaticamente confirmações da administradora.'],casos}
const saida=process.argv.find(a=>a.startsWith('--saida='))?.slice(8)??path.resolve('.local/scanner-revisao-quebrados/relatorio-'+hoje)
await mkdir(path.dirname(saida),{recursive:true})
await writeFile(saida+'.json',JSON.stringify(relatorio,null,2),'utf8')
const html=renderizarRevisaoQuebrados(relatorio)
await writeFile(saida+'.html',html,'utf8')
console.log(JSON.stringify({relatorio:saida,resumo:relatorio.resumo,portais_consultados:0,alteracoes:0}))
