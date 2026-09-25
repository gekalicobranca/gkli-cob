import { createAdminClient } from '@/utils/supabase/admin'

// Monitoring must never interrupt delivery or expose delivery errors to clients.
export async function registrarWorker(canal: 'email' | 'whatsapp', estado: 'operando' | 'erro') {
  try {
    const agora = new Date().toISOString()
    const { error } = await createAdminClient().from('agente_workers').upsert({
      script_key: `mensageria:${canal}`, ultimo_sinal_em: agora, updated_at: agora,
      metadata_json: { estado },
    })
    if (error) console.error('Falha ao registrar status do worker:', error.message)
  } catch { console.error('Falha ao registrar status do worker.') }
}
