import { Bot, Clock3, TrendingUp } from 'lucide-react'
import {
  getMockNextBestAction,
  getMockOperationalSignals,
  getSignalToneClasses,
} from '@/features/ai/operational-ai'
import { NextBestActionCard } from '@/components/ai/next-best-action-card'

export function InvisibleAIPanel() {
  const signals = getMockOperationalSignals()
  const nextAction = getMockNextBestAction()

  return (
    <aside className="space-y-4">
      <NextBestActionCard action={nextAction} />

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-[#04799a]" />
          <h2 className="text-sm font-semibold text-slate-950">
            Inteligência contextual
          </h2>
        </div>

        <div className="mt-4 grid gap-2">
          {signals.map((signal) => (
            <div
              key={signal.label}
              className={`rounded-2xl border px-3 py-3 ${getSignalToneClasses(signal.tone)}`}
            >
              <span className="block text-xs font-semibold uppercase tracking-[0.14em] opacity-75">
                {signal.label}
              </span>
              <strong className="mt-1 block text-sm">{signal.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-[#04799a]" />
          <h2 className="text-sm font-semibold text-slate-950">
            Leitura operacional
          </h2>
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-600">
          A IA aparece como apoio contextual, não como módulo isolado. Ela reduz decisão manual e ajuda o operador a priorizar o próximo contato.
        </p>

        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-600">
          <Clock3 size={16} className="text-[#04799a]" />
          Melhor janela de contato sugerida: após 18h.
        </div>
      </section>
    </aside>
  )
}
