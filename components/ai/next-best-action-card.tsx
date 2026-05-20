import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import type { NextBestAction } from '@/features/ai/operational-ai'

export function NextBestActionCard({ action }: { action: NextBestAction }) {
  const content = (
    <div className="rounded-[2rem] border border-[#d7eef5] bg-[#f5fbfd] p-5 shadow-sm transition hover:border-[#04799a]/40">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#04799a] text-white">
          <Sparkles size={18} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#04799a]">
              Próxima melhor ação
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
              {action.confidence}% confiança
            </span>
          </div>

          <h3 className="mt-3 text-base font-semibold text-slate-950">
            {action.title}
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            {action.description}
          </p>

          <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#04799a]">
            {action.actionLabel}
            <ArrowRight size={16} />
          </div>
        </div>
      </div>
    </div>
  )

  if (!action.href) return content

  return (
    <Link href={action.href} className="block">
      {content}
    </Link>
  )
}
