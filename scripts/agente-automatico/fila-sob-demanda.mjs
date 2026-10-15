import { mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { abrirTrava } from '../acordos-portais/manual.mjs'

export async function drenarFilaMaestro(scriptKey, { db, executar, root, stopped = () => false, lock = abrirTrava, report = console.log }) {
  const pasta = path.join(root, '.codex-tmp', 'maestro-manual')
  await mkdir(pasta, { recursive: true })
  const arquivo = path.join(pasta, `${scriptKey}.lock`)
  const trava = await lock(arquivo, { pid: process.pid, modo: 'supervisor' })
  try {
    while (!stopped()) {
      const { data: fila, error } = await db.rpc('maestro_supervisor_fila', { p_agendar: false, p_script_key: scriptKey })
      if (error) throw error
      const pedido = fila.pendentes.find(p => p.script_key === scriptKey)
      if (!pedido) return
      let claimed = false, failure
      try { await executar(scriptKey, pedido.id, id => { if (id === pedido.id) claimed = true }) }
      catch (error) { failure = error }
      const { data: atual, error: statusError } = await db.from('agente_execucoes').select('status').eq('id', pedido.id).single()
      if (statusError) throw statusError
      if (atual.status === 'em_execucao' && claimed) {
        // Uma coleta interrompida pode já ter produzido arquivo/importação.
        // Exige revisão; nunca volta silenciosamente para a fila.
        const { data: mudou, error: updateError } = await db.from('agente_execucoes').update({
          status: 'precisa_intervencao', finalizado_em: new Date().toISOString(),
          erro_mensagem: 'O coletor encerrou antes de confirmar a conclusão. Confira arquivo e importação antes de repetir.',
        }).eq('id', pedido.id).eq('status', 'em_execucao').select('id')
        if (updateError) throw updateError
        if (mudou?.length) {
          const { error: logError } = await db.from('agente_logs').insert({ execucao_id: pedido.id,step:'worker_interrompido',nivel:'error',mensagem:'Coleta interrompida; revisão necessária antes de repetir.',metadata_json:{script_key:scriptKey} })
          if (logError) throw logError
        }
      }
      const { error: cleanupError } = await db.from('agente_workers').delete().eq('script_key', scriptKey).contains('metadata_json', { execucao_id: pedido.id })
      if (cleanupError) throw cleanupError
      report(scriptKey, pedido.id, atual.status)
      if (atual.status === 'pendente') throw failure ?? new Error('Pedido não assumido; aguarda nova consulta do supervisor.')
      if (atual.status === 'em_execucao' && !claimed) return // outro consumidor ganhou a disputa
    }
  } finally { await trava.close(); await unlink(arquivo) }
}
