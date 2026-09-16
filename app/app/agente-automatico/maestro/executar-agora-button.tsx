'use client'

import { Activity, Loader2, Play, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { executarAgenteReceitaComAcompanhamento } from '@/features/agente-automatico/actions'

type Snapshot = {
  state: string; terminal: boolean; detail: string; consultadoEm: string
  execucao: { status: string; tentativas: number; created_at: string; iniciado_em: string | null; finalizado_em: string | null }
  worker: { online: boolean; ultimoSinal: string | null; scriptKey: string | null }
  arquivo: { nome_arquivo: string } | null
  conversao: { id: string; status: string; total_cobrancas: number; total_parcelas: number } | null
  logs: { id: string; step: string; nivel: string; mensagem: string; created_at: string }[]
}
const date = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Ainda não registrado'
const labels: Record<string, string> = { pendente: 'Na fila', em_execucao: 'Coletando', sucesso: 'Coleta concluída', falha: 'Falha', cancelada: 'Cancelada', precisa_intervencao: 'Requer intervenção' }

export function ExecutarAgoraButton({ receitaId, condominioNome, disabled = false, existingExecucaoId, label = 'Executar agora' }: {
  receitaId: string; condominioNome: string; disabled?: boolean; existingExecucaoId?: string; label?: string
}) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [execucaoId, setExecucaoId] = useState(existingExecucaoId ?? null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(Date.now())
  const busy = useRef(false)

  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = window.setInterval(() => setTick(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [open])

  useEffect(() => {
    if (!open || !execucaoId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    async function poll() {
      controller = new AbortController()
      const timeout = setTimeout(() => controller?.abort(), 15000)
      let terminal = false
      try {
        const response = await fetch('/api/agente-automatico/execucoes/' + execucaoId + '/status', { cache: 'no-store', signal: controller.signal })
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || 'Falha ao consultar a execução.')
        if (cancelled) return
        setSnapshot(result)
        setError('')
        terminal = result.terminal
        if (terminal) router.refresh()
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Conexão indisponível. Tentando novamente.')
      } finally {
        clearTimeout(timeout)
        if (!cancelled && !terminal) timer = setTimeout(poll, 3000)
      }
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer); controller?.abort() }
  }, [open, execucaoId, router])

  function close() { setOpen(false); router.refresh() }
  async function executar() {
    if (busy.current) return
    setOpen(true)
    if (existingExecucaoId || execucaoId) { setExecucaoId(existingExecucaoId || execucaoId); return }
    busy.current = true
    setSubmitting(true)
    setError('')
    try {
      const formData = new FormData()
      formData.set('receita_id', receitaId)
      formData.set('origem', 'maestro')
      const result = await executarAgenteReceitaComAcompanhamento(formData)
      if ('error' in result) throw new Error(result.error)
      setExecucaoId(result.execucaoId)
      router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível iniciar a coleta.') }
    finally { busy.current = false; setSubmitting(false) }
  }
  const elapsed = snapshot ? Math.max(0, Math.floor((tick - Date.parse(snapshot.execucao.created_at)) / 1000)) : 0
  const monitoring = Boolean(existingExecucaoId || execucaoId)

  return <>
    <Button size="sm" type="button" variant="secondary" disabled={submitting || (disabled && !monitoring)} onClick={executar}>
      {submitting ? <Loader2 size={14} className="animate-spin" /> : monitoring ? <Activity size={14} /> : <Play size={14} />}
      {monitoring ? 'Monitorar execução' : label}
    </Button>
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); close() }} onClose={() => setOpen(false)} className="m-auto max-h-[90vh] w-[min(720px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white p-5">
        <div><h2 id={titleId} className="text-lg font-semibold">Monitor de execução</h2><p className="mt-1 text-sm text-slate-600">{condominioNome}</p></div>
        <button type="button" onClick={close} aria-label="Fechar monitor" className="rounded-lg p-2 hover:bg-slate-100"><X size={20} /></button>
      </header>
      <div className="space-y-5 p-5">
        {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}{execucaoId ? ' O monitor tentará reconectar automaticamente.' : ''}</p> : null}
        <div role="status" aria-live="polite" className={'rounded-xl p-4 ' + (snapshot?.state === 'completed' ? 'bg-emerald-50' : ['error', 'attention'].includes(snapshot?.state ?? '') ? 'bg-amber-50' : 'bg-blue-50')}>
          <p className="font-semibold">{snapshot ? labels[snapshot.execucao.status] || snapshot.execucao.status : submitting ? 'Criando execução…' : 'Carregando monitor…'}</p>
          <p className="mt-1 text-sm">{snapshot?.detail || 'Aguardando confirmação do servidor.'}</p>
        </div>
        {snapshot ? <>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-slate-500">Agente remoto</dt><dd className={snapshot.worker.online ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>{snapshot.worker.online ? 'Online' : 'Sem sinal recente'}</dd></div>
            <div><dt className="text-slate-500">Último sinal do agente</dt><dd>{date(snapshot.worker.ultimoSinal)}</dd></div>
            <div><dt className="text-slate-500">Solicitada em</dt><dd>{date(snapshot.execucao.created_at)}</dd></div>
            <div><dt className="text-slate-500">Iniciada em</dt><dd>{date(snapshot.execucao.iniciado_em)}</dd></div>
            <div><dt className="text-slate-500">Tentativas</dt><dd>{snapshot.execucao.tentativas}</dd></div>
            <div><dt className="text-slate-500">Tempo desde a solicitação</dt><dd>{Math.floor(elapsed / 60)}min {elapsed % 60}s</dd></div>
          </dl>
          {snapshot.arquivo ? <p className="break-words rounded-lg bg-slate-50 p-3 text-sm">Arquivo: {snapshot.arquivo.nome_arquivo}</p> : null}
          {snapshot.conversao ? <div className="text-sm"><p>Conversão: {snapshot.conversao.status} · {snapshot.conversao.total_cobrancas} cobranças · {snapshot.conversao.total_parcelas} parcelas</p><a className="mt-2 inline-block text-blue-700 underline" href={'/app/configuracoes/lab/captacao-automatizada/' + snapshot.conversao.id}>Abrir validação</a></div> : null}
          <section><h3 className="mb-3 font-semibold">Últimos registros</h3>{snapshot.logs.length ? <ol className="max-h-64 space-y-3 overflow-y-auto">{snapshot.logs.map(log => <li key={log.id} className="border-l-2 border-slate-200 pl-3 text-sm"><p className="text-xs text-slate-500">{date(log.created_at)} · {log.step} · {log.nivel}</p><p className="mt-1 whitespace-pre-wrap break-words">{log.mensagem}</p></li>)}</ol> : <p className="text-sm text-slate-500">Nenhum registro disponível ainda.</p>}</section>
          <p className="text-xs text-slate-500">Atualizado em {date(snapshot.consultadoEm)}. {snapshot.terminal ? 'Acompanhamento encerrado.' : 'Atualização automática a cada 3 segundos.'}</p>
        </> : null}
        <p className="text-xs text-slate-500">Fechar este monitor não cancela a execução.</p>
      </div>
    </dialog>
  </>
}
