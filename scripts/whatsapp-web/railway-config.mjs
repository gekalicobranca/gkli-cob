import path from 'node:path'

export function railwayConfiguration(env = process.env) {
  const session = env.WHATSAPP_WEB_SESSION
  if (!session || !/^[a-zA-Z0-9_-]{1,60}$/.test(session)) throw new Error('Configure uma única WHATSAPP_WEB_SESSION por serviço Railway.')
  if (env.RAILWAY_VOLUME_MOUNT_PATH !== '/data') throw new Error('Volume persistente Railway obrigatório, montado em /data.')
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Credenciais Supabase do servidor não configuradas.')
  const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL)
  if (url.protocol !== 'https:') throw new Error('Supabase deve usar HTTPS.')
  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.')
  const base = path.posix.join('/data', session)
  return {
    session, port, authPath: path.posix.join(base, 'auth'), statePath: path.posix.join(base, 'state'),
    // Explicit opt-in at the host. A connection command in the app never changes it.
    connectOnly: env.WHATSAPP_WEB_PROCESS_MESSAGES !== 'true',
  }
}

export function workerPaths(root, env = process.env) {
  if (env.WHATSAPP_WEB_RUNTIME === 'railway') {
    const config = railwayConfiguration(env)
    return { auth: config.authPath, state: config.statePath }
  }
  return {
    auth: path.resolve(root, env.WHATSAPP_WEB_AUTH_PATH || '.whatsapp-web/auth'),
    state: path.resolve(root, env.WHATSAPP_WEB_STATE_PATH || '.whatsapp-web'),
  }
}

export function configuredPhone(wallets, routes) {
  const phones = [...new Set([...wallets.map(row => row.whatsapp_web_numero), ...routes.map(row => row.numero)]
    .map(value => String(value ?? '').replace(/\D/g, '')))]
  if (phones.length !== 1 || !/^55[1-9]\d{9,10}$/.test(phones[0])) throw new Error('A sessão precisa de uma única linha brasileira válida no cadastro do app.')
  return phones[0]
}

export function cloudWorkerOptions(config, env = process.env, phone) {
  if (!/^55[1-9]\d{9,10}$/.test(phone ?? '')) throw new Error('Linha da carteira não validada.')
  return {
    args: ['worker.mjs', ...(config.connectOnly ? ['--connect-only'] : [])],
    env: { ...env, WHATSAPP_WEB_RUNTIME: 'railway', WHATSAPP_WEB_SESSION: config.session, WHATSAPP_WEB_PHONE: phone,
      WHATSAPP_WEB_AUTH_PATH: config.authPath, WHATSAPP_WEB_STATE_PATH: config.statePath },
  }
}

export function railwayHealth({ pathname, stopping, lastPoll, connectOnly, now = Date.now() }) {
  if (pathname !== '/health') return { status: 404, body: null }
  const ok = !stopping && lastPoll > 0 && now - lastPoll >= 0 && now - lastPoll < 60000
  return { status: ok ? 200 : 503, body: { ok, runtime: 'railway', mode: connectOnly ? 'connection' : 'processing' } }
}
