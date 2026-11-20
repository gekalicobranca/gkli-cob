import { lstat, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const prefixo = 'gkli-easy-espelho-v2-'
const nomePasta = /^gkli-easy-espelho-v2-([1-9]\d{0,9})-[a-zA-Z0-9]{6}$/
const marcador = '.easy-espelhar-temporario'
const prazo = 24 * 60 * 60 * 1000

function processoEncerrado(pid) {
  try { process.kill(pid, 0); return false } catch (erro) { return erro.code === 'ESRCH' }
}

export async function recolherTemporarios(raiz, agora = Date.now()) {
  const base = await realpath(raiz)
  let removidos = 0
  for (const entrada of await readdir(base, { withFileTypes: true })) {
    const nome = nomePasta.exec(entrada.name)
    if (!nome || !entrada.isDirectory()) continue
    const pasta = path.resolve(base, entrada.name)
    if (path.dirname(pasta) !== base) continue
    try {
      const stat = await lstat(pasta)
      if (!stat.isDirectory() || stat.isSymbolicLink() || agora - stat.mtimeMs < prazo) continue
      if (process.getuid && stat.uid !== process.getuid()) continue
      if (!processoEncerrado(Number(nome[1])) || await realpath(pasta) !== pasta) continue
      const arquivo = path.join(pasta, marcador)
      const info = await lstat(arquivo)
      if (!info.isFile() || info.size !== Buffer.byteLength(entrada.name)) continue
      if (await readFile(arquivo, 'utf8') !== entrada.name) continue
      await rm(pasta, { recursive: true, force: true })
      removidos++
    } catch (erro) {
      if (erro.code !== 'ENOENT') throw erro
    }
  }
  return removidos
}

export async function criarPastaEspelhamento() {
  const base = await realpath(tmpdir())
  // A indisponibilidade de uma pasta antiga não impede a coleta atual.
  await recolherTemporarios(base).catch(() => console.warn('Limpeza de temporários do Espelhar pendente.'))
  const pasta = await mkdtemp(path.join(base, prefixo + process.pid + '-'))
  await writeFile(path.join(pasta, marcador), path.basename(pasta), { flag: 'wx', mode: 0o600 })
  return pasta
}
