import Link from 'next/link'
import { ArrowRight, BarChart3, Sparkles } from 'lucide-react'

export function HomeHeroActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <Link
        href="/app/cockpit"
        className="group inline-flex h-12 items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#0F4C81] to-[#2563EB] px-6 text-sm font-medium text-white shadow-[0_18px_40px_rgba(37,99,235,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(37,99,235,0.30)]"
      >
        <BarChart3 className="h-4 w-4 opacity-90" />
        <span>Abrir cockpit operacional</span>
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
      </Link>

      <Link
        href="/app/ia"
        className="group inline-flex h-12 items-center justify-center gap-3 rounded-2xl border border-blue-100 bg-white/80 px-6 text-sm font-medium text-[#2563EB] shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/70 hover:shadow-md"
      >
        <Sparkles className="h-4 w-4 text-violet-500 transition-transform duration-200 group-hover:rotate-12" />
        <span>Assistente IA</span>
      </Link>
    </div>
  )
}
