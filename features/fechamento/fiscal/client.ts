import { FiscalDeliveryError, type FiscalPayload } from './domain'

export type FiscalClientConfig = { baseUrl: string; authUrl: string; publicKey: string; email: string; password: string }
export function fiscalConfig(): FiscalClientConfig | null {
  const baseUrl = process.env.GKLI_CORE_FISCAL_URL?.trim()
  const authUrl = process.env.GKLI_CORE_FISCAL_AUTH_URL?.trim()
  const publicKey = process.env.GKLI_CORE_FISCAL_PUBLIC_KEY?.trim()
  const email = process.env.GKLI_CORE_FISCAL_EMAIL?.trim()
  const password = process.env.GKLI_CORE_FISCAL_PASSWORD
  if (!baseUrl || !authUrl || !publicKey || !email || !password) return null
  return { baseUrl, authUrl, publicKey, email, password }
}
function safeBase(value: string, localAllowed = false) {
  let url: URL
  try { url = new URL(value) } catch { throw new FiscalDeliveryError('URL da integração inválida.') }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !(localAllowed && local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new FiscalDeliveryError('Configure a origem HTTPS do Core, sem caminho, usuário ou parâmetros.')
  return url.origin
}
export async function createFiscalClient(config: FiscalClientConfig, request: typeof fetch = fetch) {
  const base = safeBase(config.baseUrl, true)
  const authBase = safeBase(config.authUrl, true)
  let token = ''
  async function login() {
    let response: Response
    try {
      response = await request(`${authBase}/auth/v1/token?grant_type=password`, {
        method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
        headers: { apikey: config.publicKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: config.email, password: config.password }),
      })
    } catch { throw new FiscalDeliveryError('Não foi possível autenticar a integração no Core. Tente novamente.') }
    if (!response.ok) throw new FiscalDeliveryError('Credenciais da integração recusadas pelo Core. Verifique o usuário técnico.')
    const data = await response.json().catch(() => null)
    if (typeof data?.access_token !== 'string' || !data.access_token) throw new FiscalDeliveryError('O Core não retornou uma sessão válida.')
    token = data.access_token
  }
  await login()
  return {
    async send(payload: FiscalPayload) {
      for (let attempt = 0; attempt < 2; attempt++) {
        let response: Response
        try {
          response = await request(`${base}/api/fiscal/cob/ordens`, {
            method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        } catch { throw new FiscalDeliveryError('Não foi possível confirmar a entrega ao Core. O reenvio manterá a mesma referência.') }
        if (response.status === 401 && attempt === 0) { await login(); continue }
        if (response.status === 409) throw new FiscalDeliveryError('A referência já existe no Fiscal com dados diferentes. Confira a ordem no Core.', true)
        if (response.status === 403) throw new FiscalDeliveryError('Usuário técnico sem acesso ao Fiscal ou à carteira de destino.')
        if (response.status !== 200 && response.status !== 201) throw new FiscalDeliveryError(`Entrega não confirmada pelo Core (HTTP ${response.status}). Verifique os dados e a configuração.`)
        const data = await response.json().catch(() => null)
        if (!data || typeof data.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(data.id) || typeof data.created !== 'boolean') throw new FiscalDeliveryError('Resposta do Core incompleta. Reenvie para confirmar a ordem.')
        return { id: data.id as string, created: data.created as boolean }
      }
      throw new FiscalDeliveryError('Sessão recusada pelo Core.')
    },
  }
}
