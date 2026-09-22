import { LoaderCircle } from 'lucide-react'

export default function LoadingFlows() {
  return <div role="status" aria-live="polite" aria-busy="true" className="space-y-4">
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600"><LoaderCircle size={20} className="animate-spin text-[var(--gkli-primary)]" aria-hidden="true" />Carregando flows de cobrança...</div>
    <div className="grid gap-3 sm:grid-cols-3" aria-hidden="true">{[1, 2, 3].map(item => <div key={item} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}</div>
    <div className="h-64 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />
  </div>
}
