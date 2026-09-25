'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { WorkerStatus } from '@/features/mensageria/worker-status'

const StatusContext = createContext<{ statuses: Record<string, WorkerStatus>; failed: boolean }>({ statuses: {}, failed: false })
export function FlowWorkerProvider({ canal, children, enabled = true }: { canal: string; children: ReactNode; enabled?: boolean }) {
  const [statuses, setStatuses] = useState<Record<string, WorkerStatus>>({})
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    async function refresh() {
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(refresh, 30000)
        return
      }
      try {
        const response = await fetch(`/api/flows/cobranca/workers?canal=${encodeURIComponent(canal)}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
        if (!response.ok) throw new Error()
        const data = await response.json()
        if (!disposed) { setStatuses(data.statuses ?? {}); setFailed(false) }
      } catch { if (!disposed) { setStatuses({}); setFailed(true) } }
      finally { if (!disposed) timer = setTimeout(refresh, 30000) }
    }
    setStatuses({})
    setFailed(false)
    void refresh()
    return () => { disposed = true; clearTimeout(timer); controller.abort() }
  }, [canal, enabled])
  return <StatusContext.Provider value={{ statuses, failed }}>{children}</StatusContext.Provider>
}

export function FlowWorkerStatus({ carteiraId }: { carteiraId: string }) {
  const { statuses, failed } = useContext(StatusContext)
  const status = statuses[carteiraId] ?? { cor: 'amarelo', texto: failed ? 'Falha ao consultar o estado dos envios' : 'Consultando estado dos envios…' }
  const colors = { verde: 'bg-emerald-500', amarelo: 'bg-amber-400', vermelho: 'bg-rose-500' }
  return <span role="status" title="Status atual do worker; atualizado a cada 30 segundos. Não altera a agenda do Flow." className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${colors[status.cor]}`} />{status.texto}
  </span>
}

export function FlowWorkerExplanation({ carteiraId }: { carteiraId: string }) {
  const { statuses, failed } = useContext(StatusContext)
  const status = statuses[carteiraId]
  if (!status) return failed ? <p className="mt-2 text-xs text-amber-800">A consulta falhou; isso não confirma queda do WhatsApp. Nova tentativa automática em 30 segundos.</p> : null
  return <div className="mt-2 space-y-1 text-xs leading-relaxed text-slate-600">
    {status.detalhe ? <p>{status.detalhe}</p> : null}
    {status.proximoPasso ? <p><strong>Próximo passo:</strong> {status.proximoPasso}</p> : null}
    {status.sinalEm ? <p className="text-slate-500">Último sinal: {new Date(status.sinalEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília).</p> : null}
    <p className="text-slate-500">O estado do Flow indica sua programação; não confirma envio ou entrega.</p>
  </div>
}
