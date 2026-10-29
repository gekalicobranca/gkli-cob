import process from 'node:process'

const HEARTBEAT_MS = 120_000

export async function startWorkerHeartbeat(supabase, scriptKey, options = {}) {
  const schedule = options.schedule ?? setTimeout
  const cancel = options.cancel ?? clearTimeout
  const log = options.log ?? ((error) => console.error('Falha ao registrar sinal de vida:', error.message))
  let timer, stopped = false, failures = 0, controller
  async function registrar() {
    if (stopped) return
    controller = new AbortController()
    try {
    const agora = new Date().toISOString()
    const { error } = await supabase.from('agente_workers').upsert({
      script_key: scriptKey,
      ultimo_sinal_em: agora,
      versao: '1',
      metadata_json: { plataforma: process.platform, ...(process.env.AGENTE_EXECUCAO_ID ? { execucao_id: process.env.AGENTE_EXECUCAO_ID, modo: 'sob_demanda' } : {}) },
      updated_at: agora,
    }, { onConflict: 'script_key' }).abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(options.timeoutMs ?? 20_000)]))
    if (error) throw error
    failures = 0
    } catch (error) {
      if (!stopped) { failures = Math.min(failures + 1, 5); log(error) }
    } finally {
      controller = null
      // Agenda somente depois de concluir/abortar: nunca sobrepõe sinais de vida.
      if (!stopped) {
        timer = schedule(() => void registrar(), Math.min(300_000, HEARTBEAT_MS * 2 ** failures))
        timer?.unref?.()
      }
    }
  }

  await registrar()
  return { stop() { stopped = true; cancel(timer); controller?.abort() } }
}
