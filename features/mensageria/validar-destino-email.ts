import type {SupabaseClient} from '@supabase/supabase-js'
export async function validarDestinoEmail(db: SupabaseClient, carteiraId: string | null | undefined, destinatario: string) {
 if (!carteiraId) {
  const {data,error}=await db.from('email_retornos').select('id').eq('destinatario',destinatario.trim().toLowerCase()).eq('classificacao','inexistente').limit(1)
  if(error)throw new Error('Não foi possível conferir bloqueios do destinatário.')
  if(data?.length)throw new Error('Endereço inexistente; envio bloqueado.')
  return
 }
 const {data,error}=await db.rpc('email_destino_invalido',{p_carteira:carteiraId,p_destino:destinatario})
 if(error)throw new Error('Não foi possível conferir bloqueios do destinatário.')
 if(data)throw new Error('Endereço inexistente confirmado por retorno de entrega; envio bloqueado.')
}
