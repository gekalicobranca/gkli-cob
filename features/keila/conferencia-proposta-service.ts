import { REGRA_VALIDADE_PROPOSTA, validarVencimentoProposta } from '../agentes-virtuais/validade-proposta'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import type { KeilaCasoPayload } from './casos'
import {destinoRespostaKeila} from './destino-resposta'
import { salvarCaso, type carregarCaso } from './casos-service'
import { extrairCotasLello, conferirProposta, renderizarPropostaConferida, incluirAcolhimentoProposta, hashConferencia, type ConferenciaProposta } from './conferencia-proposta'
import {CADIZ_ID,CADIZ_CARTEIRA,lerConferenciaManager,selecionarCotasManager,normalizarManager} from '../lidia/conferencia-manager'
import {ACORDO_STATUS_ATIVOS} from '../../lib/constants/acordos'

/** Evidência é recalculada no servidor a partir do arquivo, nunca aceita pelo JSON do operador. */
export async function gerarConferenciaProposta(db: SupabaseClient, caso: {condominio_id: string; carteira_id: string; payload: KeilaCasoPayload; tipo?: string}, input: {arquivo_id: string; quantidade: number; vencimento: string}, hoje = new Date(), historica = false): Promise<ConferenciaProposta> {
 if (!historica) validarVencimentoProposta(input.vencimento, hoje)
 if (!Number.isInteger(input.quantidade) || input.quantidade < 1 || input.quantidade > 120) throw new Error('Informe entre 1 e 120 parcelas para a proposta (1 = à vista).')
 if (caso.payload.unidade_ids.length !== 1) throw new Error('Conferência automática requer uma única unidade.')
 const execucaoId=caso.payload.execucao_id
 if (!execucaoId) throw new Error('Vincule uma coleta de débitos concluída.')
 const {data: execucao,error: execError}=await db.from('agente_execucoes').select('id,status,created_at').eq('id',execucaoId).eq('condominio_id',caso.condominio_id).eq('carteira_id',caso.carteira_id).single()
 const dia=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(hoje)
 if (execError || execucao?.status!=='sucesso' || new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(execucao.created_at))!==dia) throw new Error('A proposta precisa de coleta concluída do mesmo dia e condomínio.')
 const {data: arquivo,error: arqError}=await db.from('agente_arquivos').select('id,nome_arquivo,storage_path,hash_arquivo').eq('id',input.arquivo_id).eq('execucao_id',execucaoId).single()
 if(arqError || !arquivo?.storage_path?.startsWith(`${execucaoId}/`) || !/\.xlsx?$/i.test(arquivo.nome_arquivo)) throw new Error('Arquivo da coleta indisponível ou incompatível.')
 const {data: unidade,error: unError}=await db.from('unidades').select('id,identificacao,bloco,responsavel_nome,email,acao_judicial').eq('id',caso.payload.unidade_ids[0]).eq('condominio_id',caso.condominio_id).eq('carteira_id',caso.carteira_id).single()
 if(unError || !unidade || unidade.acao_judicial) throw new Error('Unidade sem conferência ou com bloqueio judicial.')
 const email=destinoRespostaKeila(caso.payload)
 if(!email || unidade.email?.trim().toLowerCase()!==email.remetente.trim().toLowerCase()) throw new Error('Remetente diverge do contato principal da unidade. Revisão necessária.')
 const {data: blob,error: downloadError}=await db.storage.from('agente-relatorios').download(arquivo.storage_path)
 if(downloadError || !blob || blob.size>20*1024*1024) throw new Error('Não foi possível conferir o relatório completo.')
 const buffer=Buffer.from(await blob.arrayBuffer())
 const sha256=createHash('sha256').update(buffer).digest('hex')
 if(arquivo.hash_arquivo && arquivo.hash_arquivo.toLowerCase()!==sha256)throw new Error('Hash do relatório diverge do arquivo coletado. Não liberar proposta.')
 const {data: cadastro,error: cobError}=await db.from('cobrancas').select('id,vencimento,valor_atualizado,status_operacional,status_financeiro,duplicada_de_id,observacoes').eq('unidade_id',unidade.id).eq('condominio_id',caso.condominio_id).eq('carteira_id',caso.carteira_id)
 const {data: condominio,error: condoError}=await db.from('condominios').select('nome,administradora,dias_apos_vencimento_regua,despesas_acordo_avista_percentual,despesas_acordo_parcelado_percentual,parcelas_acordo_sem_aprovacao_sindico').eq('id',caso.condominio_id).eq('carteira_id',caso.carteira_id).single()
 if(cobError || condoError || !condominio) throw new Error('Não foi possível conciliar cadastro e regras atuais.')
 const manager=/MANAGER|ATENTUM/.test(normalizarManager(condominio.administradora))
 let cotas,fonteManager:ReturnType<typeof lerConferenciaManager>|undefined
 if(manager){
  if(caso.tipo!=='lidia_atendimento'||caso.condominio_id!==CADIZ_ID||caso.carteira_id!==CADIZ_CARTEIRA)throw new Error('Conferência Manager habilitada somente para Lidia/Cádiz na carteira atual.')
  const {data:acordos,error:acordoError}=await db.from('acordos').select('id').eq('unidade_id',unidade.id).eq('condominio_id',caso.condominio_id).eq('carteira_id',caso.carteira_id).in('status',ACORDO_STATUS_ATIVOS).limit(1)
  if(acordoError||acordos?.length)throw new Error('Unidade com acordo existente ou sem conferência de acordos; revisão humana necessária.')
  fonteManager=lerConferenciaManager(buffer)
  cotas=selecionarCotasManager(fonteManager,unidade,condominio.nome,dia)
 }else{
  const workbook=XLSX.read(buffer,{type:'buffer'})
  if(!workbook.Sheets.Inadimplentes) throw new Error('Formato Lello não reconhecido. Não liberar proposta automática.')
  const rows=XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Inadimplentes,{header:1,defval:''})
  const normalizar=(v: string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim()
  const headers=rows.filter(r=>r.includes('Unidade') && r.map(String).includes(String(unidade.identificacao)))
  if(!headers.length || headers.some(r=>normalizar(String(r[12]))!==normalizar(unidade.responsavel_nome ?? ''))) throw new Error('Responsável da fonte diverge do cadastro. Revisão necessária.')
  cotas=extrairCotasLello(rows,String(unidade.identificacao))
 }
 const plano=conferirProposta(cotas,cadastro ?? [],condominio,input.quantidade,input.vencimento,hoje,manager?{suspenderAntesDe:null}:undefined)
 const codigo=String(unidade.identificacao)
 const descricao=manager?`a unidade ${codigo}${unidade.bloco&&unidade.bloco!=='0'?`, bloco ${unidade.bloco}`:''}`:/^[1-9]\d{5}$/.test(codigo) ? `a unidade ${Number(codigo.slice(1))}, bloco ${codigo[0]}` : `a unidade ${codigo}`
 const orientacao=caso.payload.orientacao_proposta?{...caso.payload.orientacao_proposta,administradora:condominio.administradora?.toUpperCase()==='LELLO'?'Lello':condominio.administradora?.trim()||'administradora'}:undefined
 const acolhimento=caso.payload.acolhimento_resposta
 const texto=incluirAcolhimentoProposta(renderizarPropostaConferida(email.nome,descricao,condominio.nome,dia,plano,orientacao,{historica,agenteId:caso.tipo==='lidia_atendimento'?'lidia':'keila'}),acolhimento)
 const base={...(manager?{fonte_formato:'manager_cadiz_v1' as const,fechamento_manager:{unidades:fonteManager!.unidades,recibos:fonteManager!.recibos.length,total:fonteManager!.total}}:{}),...(historica?{}:{validade_regra:REGRA_VALIDADE_PROPOSTA}),versao:1 as const,arquivo_id:arquivo.id,execucao_id:execucaoId,sha256,data_fonte:dia,quantidade:input.quantidade,vencimento:input.vencimento,nome:email.nome,unidade:descricao,condominio:condominio.nome,plano,texto,...(orientacao?{orientacao}:{}),...(acolhimento?{acolhimento}:{})}
 return {...base,hash:hashConferencia({...base,email_chave:email.chave,destinatario:email.remetente,anexos:caso.payload.resposta_anexos??[]})}
}
export async function validarConferenciaAtual(db: SupabaseClient, caso: {condominio_id:string;carteira_id:string;payload:KeilaCasoPayload;tipo?:string}) {
 const c=caso.payload.conferencia_proposta
 if(!c)throw new Error('Proposta sem conferência automática. Gere uma versão conferida antes de aprovar.')
 const atual=await gerarConferenciaProposta(db,caso,c,new Date(),!c.validade_regra && !!caso.payload.resposta_aprovada)
 if(c.hash!==atual.hash || caso.payload.resposta_simulada?.trim()!==atual.texto.trim()) throw new Error('Fonte, regras, cotas, anexos ou texto mudaram. Gere uma nova versão e revise antes de aprovar.')
 return atual
}

export async function prepararPropostaConferida(db: SupabaseClient, caso: Awaited<ReturnType<typeof carregarCaso>>, input: {arquivo_id:string;quantidade:number;vencimento:string}, usuarioId: string|null) {
 if(caso.payload.resposta_aprovada || ['atendimento_humano','concluido'].includes(caso.payload.estado)) throw new Error('Preserve a aprovação ou o atendimento humano; concilie antes de substituir o rascunho.')
 const conferida=await gerarConferenciaProposta(db,caso,input)
 if(caso.payload.conferencia_proposta?.hash===conferida.hash && caso.payload.resposta_simulada===conferida.texto) return conferida
 const em=new Date().toISOString(),resumo=`Relatório completo conciliado: ${conferida.plano.incluidas.length} cotas incluídas, ${conferida.plano.excluidas.length} excluídas. Nova aprovação necessária; nenhum envio.`
 const eventos=caso.payload.registro_json?.eventos??[]
 const id=`conferencia-automatica-${conferida.hash}`
 await salvarCaso(db,caso,{...caso.payload,estado:'proposta_preparada',conferencia_proposta:conferida,resposta_simulada:conferida.texto,resposta_email_chave:destinoRespostaKeila(caso.payload)!.chave,
  ...(conferida.fonte_formato==='manager_cadiz_v1'&&caso.payload.acompanhamento?{acompanhamento:{...caso.payload.acompanhamento,pendencias:caso.payload.acompanhamento.pendencias.map(p=>!p.resolvida_em&&p.tipo==='proposta'&&p.proxima_acao.startsWith('Conferência da Manager pendente:')?{...p,resolvida_em:em,evidencia:`${p.evidencia??''}\nConferência Manager concluída: ${conferida.hash}.`}:p)}}:{}),
  proxima_acao:'Conferência automática concluída. Revise cotas, exclusões, valores e datas propostas e aprove esta versão. Nenhum envio realizado.',
  registro_json:{versao:1,eventos:eventos.some(e=>e.id===id)?eventos:[...eventos,{id,em,tipo:'proposta_preparada',resumo,dados:{versao_hash:conferida.hash,arquivo_id:conferida.arquivo_id,sha256:conferida.sha256}}]},
  atividades:[...caso.payload.atividades,{em,usuario_id:usuarioId,descricao:resumo+` Versão ${conferida.hash}.`}]},usuarioId)
 return conferida
}
