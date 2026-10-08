import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { mkdir, open, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import { bancoDocumentos, salvarPdf } from '../manager-acordos/documentos.mjs'
import { verificarConfiguracao, argumentosColetor } from './integracao.mjs'

const portal = process.argv[2]
if (!['lello', 'bbz', 'atipass', 'hflex'].includes(portal)) throw new Error('Informe lello, bbz, atipass ou hflex.')
const administradora = { lello: 'Lello', atipass: 'ATIPASS', bbz: 'BBZ', hflex: 'HFlex' }[portal]
const executar = promisify(execFile), db = bancoDocumentos(), workerId = randomUUID()
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const nomeWorker = `${portal}-acordos`
const saida = path.join(os.homedir(), 'Downloads', `${nomeWorker}-fila`)
await mkdir(saida, { recursive: true })
const lockPath = path.join(saida, '.fila.lock'), lock = await open(lockPath, 'wx')
await lock.writeFile(JSON.stringify({ pid: process.pid, worker_id: workerId }))
let encerrando = false
process.on('SIGINT', () => { encerrando = true }); process.on('SIGTERM', () => { encerrando = true })
async function sinal() {
  const { error } = await db.from('agente_acordos_workers').upsert({ nome: nomeWorker, worker_id: workerId, ultimo_sinal: new Date().toISOString() })
  if (error) throw error
}
async function atualizar(job, campos) {
  const { data, error } = await db.from('agente_acordos_execucoes').update(campos).eq('id', job.id).eq('worker_id', workerId).eq('status', 'em_execucao').select('id')
  if (error || data.length !== 1) throw new Error('Execução deixou de pertencer a este consumidor.')
}
async function cadastro(job) {
  const [config, condo] = await Promise.all([
    db.from('agente_acordos_configuracoes').select('*').eq('condominio_id', job.condominio_id).single(),
    db.from('condominios').select('status,administradora,carteira_id').eq('id', job.condominio_id).single(),
  ])
  if (config.error || condo.error) throw new Error('Não foi possível conferir o cadastro.')
  verificarConfiguracao(config.data, condo.data, job)
  return config.data
}
const heartbeat = setInterval(() => sinal().catch(() => console.error('Falha ao informar presença do agente de PDFs.')), 20000)
try {
  await sinal(); console.log(`${nomeWorker} online; fila própria de PDFs.`)
  while (!encerrando) {
    const { data, error } = await db.rpc('reivindicar_agente_acordos_portal', { p_worker_id: workerId, p_administradora: administradora })
    if (error) throw error
    const job = data?.[0]
    if (!job) { await new Promise(r => setTimeout(r, 5000)); continue }
    try {
      const config = await cadastro(job)
      const pasta = path.join(saida, job.id); await mkdir(pasta, { recursive: true })
      const consolidado = await PDFDocument.create(), fontes = []
      for (const [index, alvo] of config.alvos_portal.entries()) {
        const saidaAlvo = path.join(pasta, String(index + 1))
        await executar(process.execPath, argumentosColetor(raiz, portal, alvo, saidaAlvo), { cwd: raiz, windowsHide: true, timeout: 15 * 60 * 1000, maxBuffer: 1024 * 1024 })
        const diretorioPortal = path.join(saidaAlvo, portal)
        const dirs = (await readdir(diretorioPortal, { withFileTypes: true })).filter(d => d.isDirectory())
        if (dirs.length !== 1) throw new Error('Saída do coletor não reconhecida.')
        const documentos = path.join(diretorioPortal, dirs[0].name)
        const resumo = JSON.parse(await readFile(path.join(documentos, 'resumo.json'), 'utf8'))
        if (resumo.status !== 'sucesso' || resumo.codigo !== alvo.codigo || resumo.condominio !== alvo.nome) throw new Error('Coleta não validada para o alvo solicitado.')
        const original = await PDFDocument.load(await readFile(path.join(documentos, 'acordos.pdf')))
        const paginas = await consolidado.copyPages(original, original.getPageIndices())
        paginas.forEach(p => consolidado.addPage(p)); fontes.push({ ...alvo, paginas: original.getPageCount() })
      }
      // Revalida antes de publicar caso o cadastro mude durante a coleta.
      const atual = await cadastro(job)
      if (JSON.stringify(atual.alvos_portal) !== JSON.stringify(config.alvos_portal)) throw new Error('Alvos mudaram durante a coleta.')
      const arquivo = path.join(pasta, `${portal}-acordos.pdf`)
      await writeFile(arquivo, await consolidado.save())
      await writeFile(path.join(pasta, 'fontes.json'), JSON.stringify(fontes, null, 2))
      await atualizar(job, { etapa: 'pdf' })
      const metadata = await salvarPdf(db, arquivo, `${job.carteira_id}/${job.id}/${portal}-acordos.pdf`)
      await atualizar(job, { ...metadata, status: 'sucesso', etapa: 'concluido', finalizado_em: new Date().toISOString(), mensagem: null })
      console.log(`PDF concluído: ${job.id} (${fontes.length} acesso(s), ${consolidado.getPageCount()} páginas)`)
    } catch (error) {
      await atualizar(job, { status: 'falha', etapa: 'coleta', finalizado_em: new Date().toISOString(), mensagem: 'Não foi possível concluir todos os acessos deste condomínio. Confira a configuração e o acesso ao portal antes de tentar novamente.' })
      console.error(`Resgate falhou: ${job.id} (${error.code || 'coleta'})`)
    }
  }
} finally {
  clearInterval(heartbeat)
  await db.from('agente_acordos_workers').delete().eq('nome', nomeWorker).eq('worker_id', workerId)
  await lock.close(); await unlink(lockPath)
}
