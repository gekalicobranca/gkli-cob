'use server'
import {redirect} from 'next/navigation'
import {revalidatePath} from 'next/cache'
import {requireRole} from '@/utils/auth/require-role'
import {getPermittedCarteiras} from '@/utils/auth/get-permitted-carteiras'
import {createAdminClient} from '@/utils/supabase/admin'
import {prepararWhatsAppRetornoEmail} from './retorno-email-whatsapp-service'

export async function prepararAvisoRetornoEmail(form:FormData){
 await requireRole(['admin','gestor','operador'])
 const scope=await getPermittedCarteiras();let erro='',caso='',resultado=''
 try{
  const r=await prepararWhatsAppRetornoEmail(createAdminClient(),String(form.get('retorno_id')??''),scope.carteiraIds,scope.userId)
  caso=r.caso_id??''
  resultado=r.situacao==='rascunho_pronto'?'Aviso preparado para revisão, sem envio.':r.motivo??'Registro existente preservado. Confira o atendimento.'
 }catch(e){erro=e instanceof Error?e.message:'Não foi possível preparar o aviso.'}
 revalidatePath('/app/gestao/keila')
 redirect(`/app/gestao/keila?${new URLSearchParams({...(!caso?{tab:'whatsapp'}:{caso}),...(erro?{erro}:{resultado})})}`)
}
