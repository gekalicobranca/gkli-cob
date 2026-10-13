import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, unlink } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { bancoDocumentos } from '../manager-acordos/documentos.mjs'
import { esperarTrava } from '../acordos-portais/manual.mjs'
import { coletorManual, execucaoDaUrlMaestro, urlExecutorMaestro } from '../../features/agente-automatico/executor-manual.mjs'
import { concluirExecucaoMaestro } from './concluir-maestro.mjs'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export async function executarPedidoMaestro(id, { db = bancoDocumentos(), executar = promisify(execFile), trava = esperarTrava, pastaTravas = path.join(raiz, '.codex-tmp', 'maestro-manual') } = {}) {
  urlExecutorMaestro(id)
  const { data: pedido, error } = await db.from('agente_execucoes')
    .select('id,status,origem,agendado_para,receita:agente_receitas!inner(script_key,ativo)')
    .eq('id', id).in('origem', ['maestro', 'manual']).is('agendado_para', null).maybeSingle()
  if (error) throw new Error('Não foi possível consultar o pedido manual.')
  if (!pedido || pedido.status !== 'pendente') return false
  const receita = Array.isArray(pedido.receita) ? pedido.receita[0] : pedido.receita
  if (!receita?.ativo) throw new Error('Receita inativa.')
  const script = coletorManual(receita.script_key)
  const pasta = pastaTravas
  await mkdir(pasta, { recursive: true })
  const arquivoTrava = path.join(pasta, `${receita.script_key}.lock`)
  const lock = await trava(arquivoTrava, { pid: process.pid, execucao_id: id }, true)
  try {
    await executar(process.execPath, ['--env-file=.env.local', path.join(raiz, 'scripts/agente-automatico', script)], {
      cwd: raiz, windowsHide: true, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, AGENTE_EXECUCAO_ID: id, AGENTE_RUN_ONCE: 'true', AGENTE_HEADLESS: 'true', AGENTE_DIAGNOSTICO_RECEITA: '' },
    })
    // Se outro consumidor assumiu o mesmo ID na disputa, acompanha só este
    // pedido e garante sua montagem; nunca passa a consumir a fila global.
    const limite = Date.now() + 30 * 60 * 1000
    let atual
    do {
      const resultado = await db.from('agente_execucoes').select('status,erro_mensagem').eq('id', id).single()
      if (resultado.error) throw new Error('Não foi possível acompanhar a execução manual.')
      atual = resultado.data
      if (atual.status !== 'em_execucao') break
      await new Promise(resolve => setTimeout(resolve, 3000))
    } while (Date.now() < limite)
    if (atual?.status === 'pendente') {
      await db.from('agente_execucoes').update({ status: 'falha', finalizado_em: new Date().toISOString(), erro_mensagem: 'O executor local não conseguiu assumir este pedido. Confira o acesso e execute novamente.' }).eq('id', id).eq('status', 'pendente')
      throw new Error('Pedido não assumido pelo executor.')
    }
    if (atual?.status !== 'sucesso') throw new Error('A execução manual não foi concluída. Consulte o monitor.')
    if (pedido.origem === 'maestro') {
      const [montagem, vazio] = await Promise.all([
        db.from('maestro_flow_montagens').select('status').eq('execucao_id', id).maybeSingle(),
        db.from('agente_logs').select('id').eq('execucao_id', id).eq('step', 'sem_inadimplencia').limit(1),
      ])
      if (montagem.error || vazio.error) throw new Error('Não foi possível conferir o resultado do Maestro.')
      if (!vazio.data?.length && montagem.data?.status !== 'concluido') await concluirExecucaoMaestro(db, id, fetch, true)
    }
    return true
  } finally {
    await db.from('agente_workers').delete().eq('script_key', receita.script_key).contains('metadata_json', { execucao_id: id })
    await lock.close(); await unlink(arquivoTrava)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await executarPedidoMaestro(execucaoDaUrlMaestro(process.argv[2])) }
  catch { console.error('Não foi possível abrir o executor do Maestro. Consulte o monitor e tente abrir novamente.'); process.exitCode = 1 }
}
