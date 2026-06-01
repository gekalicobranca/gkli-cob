import { ChevronUp, Sparkles } from 'lucide-react'

export function MobileCaseDrawer() {
  return (
    <section className="rounded-t-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:rounded-[2rem]">
      <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-slate-200 md:hidden" />

      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#04799a]">
            Resumo do case
          </span>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">
            Prioridade alta
          </h2>
        </div>

        <ChevronUp size={18} className="text-slate-400" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-slate-50 p-3">
          <span className="text-xs text-slate-500">Valor</span>
          <strong className="mt-1 block text-sm text-slate-950">R$ 8.420,00</strong>
        </div>

        <div className="rounded-2xl bg-slate-50 p-3">
          <span className="text-xs text-slate-500">Status</span>
          <strong className="mt-1 block text-sm text-slate-950">Negociação</strong>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-[#d7eef5] bg-[#f5fbfd] p-3 text-sm leading-6 text-slate-600">
        <span className="inline-flex items-center gap-2 font-semibold text-[#04799a]">
          <Sparkles size={15} />
          IA
        </span>
        <p className="mt-1">Boa chance de acordo com entrada reduzida.</p>
      </div>
    </section>
  )
}
