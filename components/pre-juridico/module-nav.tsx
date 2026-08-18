import Link from 'next/link'
import { Activity, GitBranch, LayoutDashboard } from 'lucide-react'

const items = [
  { id: 'painel', label: 'Painel Pré', description: 'Preparação e encaminhamento', href: '/app/pre-juridico', icon: LayoutDashboard },
  { id: 'regua', label: 'Régua', description: 'Prazos e habilitação', href: '/app/pre-juridico/regua', icon: GitBranch },
  { id: 'monitor', label: 'Monitor', description: 'Lotes, entregas e falhas', href: '/app/pre-juridico/monitor', icon: Activity },
] as const

export function PreJuridicoModuleNav({ active }: { active: (typeof items)[number]['id'] }) {
  return (
    <nav aria-label="Navegação do pré-jurídico" className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-3">
      {items.map((item) => {
        const Icon = item.icon
        const selected = item.id === active
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={selected ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 transition ${selected ? 'bg-[#edf8fb] text-[#04799a] ring-1 ring-[#d7eef5]' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-white' : 'bg-slate-100'}`}>
              <Icon size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="block truncate text-xs opacity-75">{item.description}</span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
