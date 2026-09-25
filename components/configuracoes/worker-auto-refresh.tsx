'use client'
import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function WorkerAutoRefresh({ updatedAt }: { updatedAt?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') startTransition(() => router.refresh()) }
    const timer = setInterval(refresh, 30000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh) }
  }, [router])
  return <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
    <p role="status">{updatedAt ? `Consulta: ${new Date(updatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · Brasília. ` : ''}Atualização automática a cada 30 segundos.</p>
    <button disabled={pending} onClick={() => startTransition(() => router.refresh())} className="rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-700 disabled:opacity-50">{pending ? 'Atualizando…' : 'Atualizar agora'}</button>
  </div>
}
