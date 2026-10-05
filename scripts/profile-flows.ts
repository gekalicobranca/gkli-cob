import { writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { parseArgs } from 'node:util'
import { getFlowCobrancaMonitorData, getFlowCobrancaPageData } from '../features/flows/cobranca/queries'
import { getFlowAcordosPageData } from '../features/flows/acordos/queries'

// Diagnóstico somente de leitura. Não chama criação, ativação ou dispatch.
// Registra volumes e tempos, sem URLs, IDs, contatos ou payloads de clientes.
async function main() {
  const { values } = parseArgs({ options: {
    mode: { type: 'string' }, canal: { type: 'string', default: 'email' },
    carteira: { type: 'string' }, condominio: { type: 'string' },
    output: { type: 'string' }, timeout: { type: 'string', default: '180000' },
  } })
  if (!['gerar', 'monitor', 'historico', 'saneamento', 'acordos'].includes(values.mode ?? '')) {
    throw new Error('Informe --mode gerar|monitor|historico|saneamento|acordos. Carregue .env.local com node --env-file.')
  }
  if (!['email', 'whatsapp'].includes(values.canal ?? '')) throw new Error('Canal inválido.')
  const timeout = Number(values.timeout)
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('Timeout inválido.')

  type RequestStat = { resource: string; ms: number; bytes: number; rows: number; ok: boolean }
  const requests: RequestStat[] = []
  const pending = new Set<Promise<Response>>()
  const originalFetch = globalThis.fetch
  const scope = { userId: 'diagnostico', isAdmin: true, perfil: 'admin', carteiraIds: null }
  const filters = { canal: values.canal, carteiraId: values.carteira, condominioId: values.condominio }
  const started = performance.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  let summary: Record<string, unknown> = {}
  let failed = false

  globalThis.fetch = (input, init) => {
    const task = (async () => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      const resource = url.pathname.startsWith('/rest/v1/') ? url.pathname.split('/').pop()! : 'outro'
      const start = performance.now()
      const inputSignal = input instanceof Request ? input.signal : undefined
      const signals = [controller.signal, init?.signal, inputSignal].filter((s): s is AbortSignal => Boolean(s))
      try {
        const response = await originalFetch(input, { ...init, signal: AbortSignal.any(signals) })
        // Consome a resposta original para contar o tráfego sem criar uma segunda
        // cópia do payload completo. A resposta reconstruída mantém status e headers.
        const body = await response.arrayBuffer()
        let rows = 0
        if (response.ok && response.headers.get('content-type')?.includes('json')) {
          const parsed = JSON.parse(new TextDecoder().decode(body))
          if (Array.isArray(parsed)) rows = parsed.length
        }
        requests.push({ resource, ms: performance.now() - start, bytes: body.byteLength, rows, ok: response.ok })
        return new Response([204, 205, 304].includes(response.status) ? null : body, {
          status: response.status, statusText: response.statusText, headers: response.headers,
        })
      } catch (error) {
        requests.push({ resource, ms: performance.now() - start, bytes: 0, rows: 0, ok: false })
        throw error
      }
    })()
    pending.add(task)
    void task.then(() => pending.delete(task), () => pending.delete(task))
    return task
  }

  try {
    if (values.mode === 'acordos') {
      const data = await getFlowAcordosPageData(scope, filters)
      summary = { parcelas: data.parcelas.length, flows: data.flows.length }
    } else if (values.mode === 'monitor' || values.mode === 'historico') {
      const data = await getFlowCobrancaMonitorData(scope, filters, { page: 1, historico: values.mode === 'historico' })
      summary = { flows: data.flows.length, hasNext: data.hasNext }
    } else {
      const data = await getFlowCobrancaPageData(scope, filters, values.mode === 'saneamento' ? { somenteSaneamento: true, page: 1 } : {})
      summary = { novas: data.totalPainel, ativas: data.totalDisponibilidade, saneamento: data.saneamento.length, reguas: data.reguas.length }
    }
  } catch {
    failed = true
  } finally {
    clearTimeout(timer)
    // Aguarda respostas irmãs ainda em andamento sem restaurar fetch cedo demais.
    controller.abort()
    await Promise.allSettled([...pending])
    globalThis.fetch = originalFetch
  }

  const groups = new Map<string, { calls: number; rows: number; bytes: number; totalMs: number; maxMs: number; failures: number }>()
  for (const r of requests) {
    const g = groups.get(r.resource) ?? { calls: 0, rows: 0, bytes: 0, totalMs: 0, maxMs: 0, failures: 0 }
    g.calls++
    g.rows += r.rows
    g.bytes += r.bytes
    g.totalMs += r.ms
    g.maxMs = Math.max(g.maxMs, r.ms)
    g.failures += Number(!r.ok)
    groups.set(r.resource, g)
  }
  const report = {
    at: new Date().toISOString(), mode: values.mode, canal: values.canal,
    filteredByCarteira: Boolean(values.carteira), filteredByCondominio: Boolean(values.condominio),
    wallMs: Math.round(performance.now() - started), ok: !failed, summary,
    calls: requests.length, rows: requests.reduce((sum, r) => sum + r.rows, 0),
    bytes: requests.reduce((sum, r) => sum + r.bytes, 0),
    resources: Object.fromEntries([...groups].map(([key, g]) => [key, {
      ...g, totalMs: Math.round(g.totalMs), maxMs: Math.round(g.maxMs),
    }])),
  }
  console.log(JSON.stringify(report, null, 2))
  if (values.output) await writeFile(values.output, JSON.stringify(report, null, 2) + '\n')
  if (failed) process.exitCode = 1
}

void main().catch(() => {
  console.error('Falha no diagnóstico. Confira os argumentos e as variáveis de ambiente.')
  process.exitCode = 1
})
