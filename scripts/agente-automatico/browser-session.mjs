import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'

export async function criarContextoChromeIsolado(chromium, rootDir, prefix, options) {
  const profilesRoot = path.resolve(rootDir, '.codex-tmp', 'browser-profiles')
  await mkdir(profilesRoot, { recursive: true })

  const safePrefix = String(prefix || 'worker')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'worker'
  const profileDir = await mkdtemp(path.join(profilesRoot, `${safePrefix}-`))
  const context = await chromium.launchPersistentContext(profileDir, options)
  return { context, profileDir }
}

export async function fecharContextoChromeIsolado(session, rootDir) {
  if (!session) return

  try {
    await limparDadosDoContexto(session.context)
    await session.context?.close().catch(() => {})
  } finally {
    if (!session.profileDir) return
    const profilesRoot = path.resolve(rootDir, '.codex-tmp', 'browser-profiles')
    const resolvedProfileDir = path.resolve(session.profileDir)
    if (!resolvedProfileDir.startsWith(`${profilesRoot}${path.sep}`)) {
      throw new Error(`Perfil temporário fora do diretório permitido: ${resolvedProfileDir}`)
    }
    await rm(resolvedProfileDir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 500,
    })
  }
}

async function limparDadosDoContexto(context) {
  if (!context) return

  await context.clearCookies?.().catch(() => {})
  await context.clearPermissions?.().catch(() => {})

  for (const page of context.pages()) {
    if (page.isClosed()) continue

    await page.evaluate(async () => {
      localStorage?.clear()
      sessionStorage?.clear()
      if ('indexedDB' in window && indexedDB.databases) {
        const databases = await indexedDB.databases().catch(() => [])
        await Promise.all(databases.map((database) => new Promise((resolve) => {
          if (!database?.name) return resolve()
          const request = indexedDB.deleteDatabase(database.name)
          request.onsuccess = request.onerror = request.onblocked = () => resolve()
        })))
      }
    }).catch(() => {})

    const client = await context.newCDPSession(page).catch(() => null)
    if (!client) continue
    await client.send('Network.clearBrowserCookies').catch(() => {})
    await client.send('Network.clearBrowserCache').catch(() => {})
    await client.send('Storage.clearDataForOrigin', {
      origin: new URL(page.url()).origin,
      storageTypes: 'all',
    }).catch(() => {})
    await client.detach().catch(() => {})
  }
}
