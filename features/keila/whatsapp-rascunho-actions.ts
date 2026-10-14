'use server'
import {redirect} from 'next/navigation'
import {revalidatePath} from 'next/cache'
import {requireRole} from '@/utils/auth/require-role'
import {getPermittedCarteiras} from '@/utils/auth/get-permitted-carteiras'
import {createAdminClient} from '@/utils/supabase/admin'
import {carregarCaso,salvarCaso} from './casos-service'
import {aprovarRascunhoWhatsApp,validarLiberacaoWhatsApp} from './whatsapp-rascunho'
/** Aprova apenas o texto. Não cria mensagens, agenda, links de envio ou chama provedores. */
export async function aprovarWhatsAppKeila(form:FormData){
 await requireRole(['admin','gestor','operador'])
 const scope=await getPermittedCarteiras(),db=createAdminClient(),id=String(form.get('id')??'');let erro=''
 try{
  if(form.get('confirmar')!=='sim')throw new Error('Confirme a revisão do destinatário e texto.')
  const c=await carregarCaso(db,id,scope.carteiraIds)
  if(c.updated_at!==String(form.get('updated_at'))||!c.payload.rascunho_whatsapp)throw new Error('Atendimento mudou. Recarregue e revise.')
  if(['atendimento_humano','concluido'].includes(c.payload.estado))throw new Error('Atendimento não permite aprovação pela Keila.')
  if(c.payload.unidade_ids.length!==1)throw new Error('Confirme a unidade do contato.')
  const {data:u,error}=await db.from('unidades').select('telefone').eq('id',c.payload.unidade_ids[0]).eq('carteira_id',c.carteira_id).single()
  if(error||u.telefone?.replace(/\D/g,'')!==c.payload.rascunho_whatsapp.destinatario)throw new Error('Celular mudou no cadastro. Revise o destinatário.')
  const r=aprovarRascunhoWhatsApp(c.payload.rascunho_whatsapp,String(form.get('versao_hash')??''),scope.userId)
  if(!c.payload.rascunho_whatsapp.aprovacao)await salvarCaso(db,c,{...c.payload,rascunho_whatsapp:r,proxima_acao:'Texto de WhatsApp aprovado para '+r.destinatario+'. Nenhuma mensagem enviada ou agendada; envio depende de solicitação posterior.',atividades:[...c.payload.atividades,{em:r.aprovacao!.em,usuario_id:scope.userId,descricao:'Rascunho de WhatsApp aprovado na tela, versão '+r.versao_hash+'. Sem envio ou agendamento.'}]},scope.userId)
 }catch(e){erro=e instanceof Error?e.message:'Não foi possível aprovar o rascunho.'}
 revalidatePath('/app/gestao/keila');redirect(`/app/gestao/keila?${new URLSearchParams({caso:id,...(erro?{erro}:{resultado:'Rascunho de WhatsApp aprovado. Nenhuma mensagem enviada.'})})}`)
}

/** Somente uma ação explícita do operador libera a versão aprovada na fila. */
export async function liberarWhatsAppKeila(form:FormData){
 await requireRole(['admin','gestor','operador'])
 const scope=await getPermittedCarteiras(),db=createAdminClient(),id=String(form.get('id')??'');let erro=''
 try{
  if(form.get('confirmar')!=='sim')throw new Error('Confirme a liberação do envio pelo WhatsApp.')
  const c=await carregarCaso(db,id,scope.carteiraIds)
  if(!c.payload.rascunho_whatsapp)throw new Error('Rascunho não encontrado.')
  validarLiberacaoWhatsApp(c.payload.rascunho_whatsapp,String(form.get('versao_hash')??''))
  const {error}=await db.rpc('keila_liberar_whatsapp',{p_caso:id,p_updated_at:String(form.get('updated_at')??''),p_hash:c.payload.rascunho_whatsapp.versao_hash,p_usuario:scope.userId})
  if(error)throw new Error(error.message)
 }catch(e){erro=e instanceof Error?e.message:'Não foi possível liberar o envio.'}
 revalidatePath('/app/gestao/keila');revalidatePath('/app/mensageria')
 redirect(`/app/gestao/keila?${new URLSearchParams({caso:id,...(erro?{erro}:{resultado:'WhatsApp liberado na fila. Acompanhe o status do transporte; liberação não confirma envio.'})})}`)
}

export async function cancelarWhatsAppKeila(form:FormData){
 await requireRole(['admin','gestor','operador'])
 const scope=await getPermittedCarteiras(),db=createAdminClient(),id=String(form.get('id')??'');let erro=''
 try{
  if(form.get('confirmar')!=='sim')throw new Error('Confirme o cancelamento desta mensagem.')
  const c=await carregarCaso(db,id,scope.carteiraIds)
  const mid=c.payload.rascunho_whatsapp?.liberacao?.mensagem_id
  if(!mid)throw new Error('Nenhuma mensagem liberada neste atendimento.')
  const {error}=await db.rpc('keila_cancelar_whatsapp',{p_caso:id,p_mensagem:mid,p_usuario:scope.userId})
  if(error)throw new Error(error.message)
 }catch(e){erro=e instanceof Error?e.message:'Não foi possível cancelar a mensagem.'}
 revalidatePath('/app/gestao/keila');revalidatePath('/app/mensageria')
 redirect(`/app/gestao/keila?${new URLSearchParams({tab:'whatsapp',...(erro?{erro}:{resultado:'WhatsApp cancelado antes do início do envio.'})})}`)
}
