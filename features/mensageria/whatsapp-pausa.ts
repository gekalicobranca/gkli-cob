import { createAdminClient } from '@/utils/supabase/admin'

export async function whatsappEnviosPermitidos(db = createAdminClient()) {
  const { data, error } = await db.rpc('workers_whatsapp_permitido')
  if (error) throw new Error('Não foi possível conferir a pausa global do WhatsApp.')
  return data === true
}
