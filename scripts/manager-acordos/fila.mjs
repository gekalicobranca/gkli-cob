import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { mkdir, open, readdir, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { bancoDocumentos, salvarPdf, verificarCadastro } from './documentos.mjs'

const executar = promisify(execFile)
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const db = bancoDocumentos()
const workerId = randomUUID()
const saida = path.join(os.homedir(), 'Downloads', 'manager-acordos-fila')
await mkdir(saida, { recursive: true })
const lockPath = path.join(saida, '.fila.lock')
// Uma instância por máquina, independente de todos os processos de inadimplência.
const lock = await open(lockPath, 'wx')
await lock.writeFile(JSON.stringify({ pid: process.pid, worker_id: workerId }))
let encerrando = false
process.on('SIGINT', () => { encerrando = true })
process.on('SIGTERM', () => { encerrando = true })
async function sinal() {
  const { error } = await db.from('agente_acordos_workers').upsert({ nome: 'manager-acordos', worker_id: workerId, ultimo_sinal: new Date().toISOString() })
  if (error) throw error
}
const heartbeat = setInterval(() => sinal().catch(() => console.error('Falha ao informar presença do agente de PDFs.')), 20000)
async function atualizar(id, campos) {
  const { error } = await db.from('agente_acordos_execucoes').update(campos).eq('id', id).eq('worker_id', workerId).eq('status', 'em_execucao')
  if (error) throw error
}
try {
  await sinal()
  console.log('Agente de PDFs de acordos online.')
  while (!encerrando) {
    const { data: jobs, error } = await db.rpc('reivindicar_agente_acordos', { p_worker_id: workerId })
    if (error) throw error
    const job = jobs?.[0]
    if (!job) { await new Promise(resolve => setTimeout(resolve, 10000)); continue }
    try {
      const { data: config, error: configError } = await db.from('agente_acordos_configuracoes').select('*').eq('condominio_id', job.condominio_id).single()
      const { data: condo, error: condoError } = await db.from('condominios').select('status,administradora,carteira_id').eq('id', job.condominio_id).single()
      if (configError || condoError) throw new Error('Não foi possível validar o cadastro do condomínio.')
      verificarCadastro(config, condo, job.codigo_cliente)
      if (config.carteira_id !== job.carteira_id) throw new Error('A carteira do condomínio mudou; solicite novo resgate.')
      const pasta = path.join(saida, job.id)
      await executar(process.execPath, [path.join(raiz, 'scripts/manager-acordos/worker.mjs'), '--codigo', job.codigo_cliente, '--saida', pasta], { cwd: raiz, windowsHide: true, timeout: 12 * 60 * 1000, maxBuffer: 1024 * 1024 })
      const subpastas = await readdir(pasta, { withFileTypes: true })
      const resultadoPasta = subpastas.find(item => item.isDirectory())
      if (!resultadoPasta) throw new Error('O agente não produziu um documento.')
      const documentos = path.join(pasta, resultadoPasta.name)
      const resumo = JSON.parse(await readFile(path.join(documentos, 'resumo.json'), 'utf8'))
      const resultado = resumo.resultados.find(item => item.codigo_cliente === job.codigo_cliente && item.status === 'sucesso')
      if (!resultado) throw new Error('Não foi possível resgatar o PDF na administradora.')
      await atualizar(job.id, { etapa: 'pdf' })
      const metadata = await salvarPdf(db, path.join(documentos, resultado.arquivo_pdf), `${job.carteira_id}/${job.id}/${resultado.arquivo_pdf}`)
      await atualizar(job.id, { ...metadata, status: 'sucesso', etapa: 'concluido', finalizado_em: new Date().toISOString(), mensagem: null })
      console.log(`PDF concluído: ${job.id}`)
    } catch {
      // Não publica erros do navegador/credenciais em uma página de usuários.
      await atualizar(job.id, { status: 'falha', etapa: 'coleta', finalizado_em: new Date().toISOString(), mensagem: 'Não foi possível resgatar o PDF. Confira o acesso à administradora e tente novamente.' })
      console.error(`Resgate falhou: ${job.id}`)
    }
  }
} finally {
  clearInterval(heartbeat)
  await db.from('agente_acordos_workers').delete().eq('nome', 'manager-acordos').eq('worker_id', workerId)
  await lock.close()
  await unlink(lockPath)
}
