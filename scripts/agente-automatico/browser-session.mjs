import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const CHROME_ARGS_AUTOFILL_DESABILITADO = [
  '--disable-save-password-bubble',
  '--disable-password-generation',
  '--disable-autofill-keyboard-accessory-view',
  '--disable-features=AutofillServerCommunication,PasswordManagerEnableAccountStorage,PasswordManagerOnboarding,PasswordLeakDetection',
  '--password-store=basic',
]

const CHROME_PREFERENCES_AUTOFILL_DESABILITADO = {
  autofill: {
    credit_card_enabled: false,
    profile_enabled: false,
  },
  credentials_enable_service: false,
  profile: {
    password_manager_enabled: false,
    password_manager_leak_detection: false,
  },
}

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
  await prepararPreferenciasChrome(profileDir)
  const context = await chromium.launchPersistentContext(profileDir, normalizarOpcoesChrome(options))
  return { context, profileDir }
}

async function prepararPreferenciasChrome(profileDir) {
  const defaultProfileDir = path.join(profileDir, 'Default')
  await mkdir(defaultProfileDir, { recursive: true })
  await writeFile(
    path.join(defaultProfileDir, 'Preferences'),
    JSON.stringify(CHROME_PREFERENCES_AUTOFILL_DESABILITADO),
    'utf8',
  )
}

function normalizarOpcoesChrome(options = {}) {
  const args = [...new Set([
    ...(Array.isArray(options.args) ? options.args : []),
    ...CHROME_ARGS_AUTOFILL_DESABILITADO,
  ])]

  return {
    ...options,
    args,
  }
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
