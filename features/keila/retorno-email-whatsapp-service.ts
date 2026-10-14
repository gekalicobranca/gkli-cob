import type {SupabaseClient} from '@supabase/supabase-js'
import {carregarCaso,registrarCasoKeila,salvarCaso,casoId} from './casos-service'
import {lerCasoPayload} from './casos'
import {montarAvisoFalhaEmail,type FalhaEmailKeila} from './retorno-email-whatsapp'

/** Preparação somente: não cria mensagens, agenda ou aprova envio. */
export async function prepararWhatsAppRetornoEmail(db:SupabaseClient,retornoId:string,carteiraIds:string[]|null,usuarioId:string|null){
 let query=db.from('email_retornos').select('id,carteira_id,unidade_id,destinatario,classificacao,motivo,recebido_em,outlook_url').eq('id',retornoId)
 if(carteiraIds!==null)query=query.in('carteira_id',carteiraIds)
 const {data:f,error}=await query.single();if(error||!f)throw new Error('Retorno não encontrado nas carteiras permitidas.')
 const {data:u,error:ue}=await db.from('unidades').select('id,condominio_id,carteira_id,responsavel_nome,telefone,email,acao_judicial,status').eq('id',f.unidade_id).eq('carteira_id',f.carteira_id).single()
 if(ue||!u)throw new Error('Unidade não encontrada.')
 if(u.email?.trim().toLowerCase()!==f.destinatario)throw new Error('O e-mail cadastrado mudou. Revise a associação do retorno.')
 if(u.acao_judicial||u.status==='inativo')return {situacao:'bloqueado',motivo:'Unidade judicial ou inativa; manter revisão humana.'}
 const {data:rows,error:ce}=await db.from('central_pendencias').select('id,payload,status').eq('tipo','keila_atendimento').eq('carteira_id',f.carteira_id).eq('condominio_id',u.condominio_id).contains('payload',{unidade_ids:[u.id]}).not('status','in','(resolvida,cancelada)')
 if(ce)throw new Error(ce.message)
 if(rows?.some(c=>lerCasoPayload(c.payload)?.estado==='atendimento_humano'))return {situacao:'bloqueado',motivo:'Unidade em atendimento humano; não iniciar contato paralelo.'}
 if((rows?.length??0)>1)return {situacao:'bloqueado',motivo:'Mais de um atendimento ativo para a unidade; conciliar os casos.'}
 const referencia=`retorno-email:${f.id}`
 const id=rows?.[0]?.id??casoId(u.condominio_id,[u.id],referencia)
 const {data:antigo,error:ae}=await db.from('central_pendencias').select('id,status').eq('id',id).maybeSingle()
 if(ae)throw new Error(ae.message)
 if(antigo&&['resolvida','cancelada'].includes(antigo.status))return {situacao:'arquivado',caso_id:id,motivo:'Atendimento arquivado preservado; não recriar pelo mesmo retorno.'}
 if(!antigo)await registrarCasoKeila(db,{condominioId:u.condominio_id,unidadeIds:[u.id],titulo:`Falha de e-mail · ${u.responsavel_nome||f.destinatario}`,intencao:'outro',emails:[],proximaAcao:'Conferir o retorno de entrega e o contato por WhatsApp.',usuarioId,carteiraIds,referencia})
 const caso=await carregarCaso(db,id,carteiraIds)
 const registrado=caso.payload.falhas_email?.some(r=>r.id===f.id)
 const falha:FalhaEmailKeila={id:f.id,destinatario:f.destinatario,classificacao:f.classificacao,motivo:f.motivo,recebido_em:f.recebido_em,outlook_url:f.outlook_url}
 const aviso=montarAvisoFalhaEmail(falha,u.responsavel_nome??'',u.telefone)
 const preservar=!!caso.payload.rascunho_whatsapp||!!caso.payload.resposta_simulada?.trim()||!!caso.payload.resposta_aprovada
 if(registrado&&(preservar||aviso.pendencia===caso.payload.proxima_acao))return {situacao:preservar?'preservado':'pendente',caso_id:id,motivo:aviso.pendencia}
 const em=new Date().toISOString()
 await salvarCaso(db,caso,{...caso.payload,falhas_email:registrado?caso.payload.falhas_email:[...(caso.payload.falhas_email??[]),falha],
  ...(!preservar?{rascunho_whatsapp:aviso.rascunho,proxima_acao:aviso.pendencia??'Revisar o aviso de falha de e-mail por WhatsApp. Aprovar o rascunho e liberar o envio na tela da Keila.'}:{}),
  atividades:[...caso.payload.atividades,{em,usuario_id:usuarioId,descricao:`Retorno de entrega ${f.id} registrado (${f.classificacao}). ${preservar?'Rascunho/aprovação existente preservado.':aviso.rascunho?'Aviso por WhatsApp preparado para revisão; sem envio.':aviso.pendencia}`}]},usuarioId)
 return {situacao:preservar?'preservado':aviso.rascunho?'rascunho_pronto':'pendente',caso_id:id,motivo:aviso.pendencia}
}
