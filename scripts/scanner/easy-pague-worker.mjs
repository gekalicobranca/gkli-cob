import { randomUUID } from 'node:crypto'
import { mkdir, open, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { createWorkerFetch } from '../agente-automatico/worker-fetch.mjs'
import { abrirLello } from './lello.mjs'
import { abrirManager } from './manager.mjs'
import { abrirWebware } from './webware.mjs'
import { portalOcupado } from './carga.mjs'
import { resultadosEasyPague } from './easy-pague-resultado.mjs'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch: createWorkerFetch() }, auth: { persistSession: false, autoRefreshToken: false },
})

async function consultar() {
  const { data: fila, error: erroFila } = await db.from('easy_pague_consultas')
    .select('id').in('estado', ['fila', 'consultando']).limit(1)
  if (erroFila?.code === 'PGRST205' || erroFila?.code === '42P01') return false
  if (erroFila) throw Error('Fila do Easy Pague indisponível.')
  if (!fila.length) return false
  if (await portalOcupado(db)) return false
  const token = randomUUID()
  const { data: lote, error } = await db.rpc('easy_pague_reservar', { p_token: token })
  if (error) throw Error('Fila do Easy Pague indisponível.')
  if (!lote) return false

  const { configuracao, pedidos } = lote
  const lockPath = configuracao.portal === 'manager'
    ? path.join(os.homedir(), 'Downloads', 'manager-acordos', '.manager-acordos.lock')
    : path.join(os.homedir(), 'Downloads', 'acordos-portais', `.${configuracao.portal}-acordos.lock`)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 220_000)
  let lock, portal
  const pendentes = new Set(pedidos.map(pedido => pedido.id))
  async function finalizar(pedido, estado, resultados = []) {
    const { error: erro } = await db.from('easy_pague_consultas')
      .update({ estado, resultados, token: null, reservado_ate: null })
      .eq('id', pedido.id).eq('token', token)
    if (erro) throw Error('Não foi possível salvar a consulta.')
    pendentes.delete(pedido.id)
  }

  try {
    await mkdir(path.dirname(lockPath), { recursive: true })
    lock = await open(lockPath, 'wx')
    await lock.writeFile(JSON.stringify({ pid: process.pid, iniciado_em: new Date().toISOString(), easy_pague: true }))
    const options = { ...configuracao, dataLimite: pedidos[0].data_limite }
    if (configuracao.portal === 'lello') {
      options.alvosFinanceiros = Object.fromEntries(pedidos.map(p => [p.unidade_portal, {
        acordos: [...new Set(p.alvos.map(a => a.acordo_externo).filter(Boolean))], recibos: [],
      }]))
      portal = await abrirLello(options, controller.signal)
    } else {
      const { data: receita, error: erro } = await db.from('agente_receitas')
        .select('ativo,config_json').eq('id', configuracao.receita_id).single()
      if (erro || !receita.ativo || receita.config_json?.condominio_id !== configuracao.condominio_id) {
        throw Error('Receita do portal indisponível.')
      }
      const { data: unidades, error: erroUnidades } = await db.from('unidades')
        .select('id,identificacao,bloco').eq('condominio_id', configuracao.condominio_id)
        .eq('carteira_id', pedidos[0].carteira_id).in('id', pedidos.map(pedido => pedido.unidade_id))
      if (erroUnidades || unidades.length !== pedidos.length) throw Error('Escopo das unidades mudou.')
      portal = await (configuracao.portal === 'manager' ? abrirManager : abrirWebware)(
        options, receita.config_json, unidades, controller.signal,
      )
    }
    for (const pedido of pedidos) {
      if (controller.signal.aborted || portal.podeIniciarUnidade?.() === false) break
      const { pagamentos } = await portal.coletar(pedido.unidade_portal)
      await finalizar(pedido, 'concluido', resultadosEasyPague(pedido.alvos, pagamentos, configuracao.portal, pedido.data_limite))
    }
  } catch (erro) {
    console.error(JSON.stringify({ easy_pague: 'consulta_interrompida', portal: configuracao.portal, codigo: erro.code ?? 'PORTAL' }))
  } finally {
    clearTimeout(timeout)
    await portal?.close().catch(() => {})
    if (lock) {
      await lock.close()
      await unlink(lockPath).catch(() => {})
    }
    for (const pedido of pedidos.filter(p => pendentes.has(p.id))) {
      await finalizar(pedido, pedido.tentativas >= 3 ? 'falha' : 'fila').catch(() => {})
    }
    await db.from('scanner_controle').update({ token: null, configuracao_id: null, reservado_ate: null }).eq('token', token)
  }
  return true
}

try {
  if (await consultar()) process.exitCode = 10
} catch {
  console.error('Easy Pague indisponível nesta rodada.')
  process.exitCode = 1
}
