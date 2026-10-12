import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { bancoDocumentos } from '../manager-acordos/documentos.mjs'
import { execucoesDaUrl, validarExecucoes } from './manual.mjs'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export async function iniciarExecucoes(ids, { db = bancoDocumentos(), executar = promisify(execFile), log = console } = {}) {
  validarExecucoes(ids.join(','))
  const { data, error } = await db.from('agente_acordos_execucoes')
    .select('id,administradora').in('id', ids).eq('status', 'pendente').eq('origem', 'manual')
  if (error) throw new Error('Não foi possível consultar as execuções solicitadas.')
  const portais = { Manager: null, Lello: 'lello', BBZ: 'bbz', ATIPASS: 'atipass', HFlex: 'hflex' }
  let falhas = 0
  for (const administradora of Object.keys(portais)) {
    const selecionadas = (data ?? []).filter(e => e.administradora === administradora).map(e => e.id)
    if (!selecionadas.length) continue
    const portal = portais[administradora]
    const script = portal ? 'scripts/acordos-portais/fila.mjs' : 'scripts/manager-acordos/fila.mjs'
    try {
      const { stdout } = await executar(process.execPath, ['--env-file=.env.local', script, ...(portal ? [portal] : []), '--execucoes', selecionadas.join(',')], { cwd: raiz, windowsHide: true, maxBuffer: 1024 * 1024 })
      log.log(stdout)
    } catch {
      // Não propaga stderr dos portais nem credenciais para a interface.
      log.error(`Não foi possível concluir a execução de ${administradora}. Consulte o histórico no aplicativo; pedidos ainda na fila podem ser reabertos pelo botão.`)
      falhas++
    }
  }
  return falhas
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await iniciarExecucoes(execucoesDaUrl(process.argv[2])) ? 1 : 0
}
