import { open, readFile, unlink } from 'node:fs/promises'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validarExecucoes(valor) {
  const ids = typeof valor === 'string' ? valor.split(',') : []
  if (!ids.length || ids.length > 100 || ids.some(id => !uuid.test(id))) throw new Error('Execuções manuais inválidas.')
  return [...new Set(ids)]
}

export function execucoesDaUrl(valor) {
  const url = new URL(valor)
  if (url.protocol !== 'gkli-acordos:' || url.hostname !== 'executar' || !['', '/'].includes(url.pathname) || url.username || url.password || url.port || url.hash || [...url.searchParams.keys()].some(k => k !== 'ids') || url.searchParams.getAll('ids').length !== 1) throw new Error('Comando de execução inválido.')
  return validarExecucoes(url.searchParams.get('ids'))
}

export function modoManual(args) {
  if (!args.length) return null
  if (args.length !== 2 || args[0] !== '--execucoes') throw new Error('Use --execucoes com os IDs solicitados.')
  return validarExecucoes(args[1])
}

// A atualização condicional impede duas aberturas de coletar o mesmo pedido.
export async function reivindicarManual(db, ids, administradora, workerId) {
  const id = ids.shift()
  if (!id) return null
  const { data, error } = await db.from('agente_acordos_execucoes')
    .update({ status: 'em_execucao', etapa: 'coleta', iniciado_em: new Date().toISOString(), worker_id: workerId })
    .eq('id', id).eq('administradora', administradora).eq('origem', 'manual').eq('status', 'pendente').select('*')
  if (error) throw error
  return data?.[0] ?? null
}

export async function abrirTrava(arquivo, conteudo) {
  try {
    const trava = await open(arquivo, 'wx')
    await trava.writeFile(JSON.stringify(conteudo))
    return trava
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    // Só remove trava residual depois de confirmar que seu processo terminou.
    // Serializa a recuperação para não remover a trava de uma nova abertura.
    const recuperacao = await open(`${arquivo}.recuperacao`, 'wx')
    try {
      const anterior = JSON.parse(await readFile(arquivo, 'utf8'))
      if (!Number.isInteger(anterior.pid) || anterior.pid <= 0) throw new Error('Trava inválida; confira o executor local.')
      try { process.kill(anterior.pid, 0) }
      catch (status) {
        if (status.code !== 'ESRCH') throw status
        await unlink(arquivo)
        return await abrirTrava(arquivo, conteudo)
      }
      const ocupado = new Error('Já existe uma coleta desta administradora em andamento.')
      ocupado.code = 'EXECUTOR_OCUPADO'
      throw ocupado
    } finally { await recuperacao.close(); await unlink(`${arquivo}.recuperacao`) }
  }
}

export async function esperarTrava(arquivo, conteudo, manual, limiteMs = 45 * 60 * 1000) {
  const fim = Date.now() + limiteMs
  while (true) {
    try { return await abrirTrava(arquivo, conteudo) }
    catch (error) {
      if (!manual || !['EXECUTOR_OCUPADO', 'EEXIST', 'ENOENT'].includes(error.code) || Date.now() >= fim) throw error
      // Espera somente enquanto este pedido manual está aberto; nunca busca outros pedidos.
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
}
