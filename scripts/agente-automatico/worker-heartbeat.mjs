import process from 'node:process'

const HEARTBEAT_MS = 15_000

export async function startWorkerHeartbeat(supabase, scriptKey) {
  async function registrar() {
    const agora = new Date().toISOString()
    const { error } = await supabase.from('agente_workers').upsert({
      script_key: scriptKey,
      ultimo_sinal_em: agora,
      versao: '1',
      metadata_json: { plataforma: process.platform },
      updated_at: agora,
    }, { onConflict: 'script_key' })
    if (error) console.error('Falha ao registrar sinal de vida:', error.message)
  }

  await registrar()
  const heartbeat = setInterval(() => void registrar(), HEARTBEAT_MS)
  heartbeat.unref()
}
