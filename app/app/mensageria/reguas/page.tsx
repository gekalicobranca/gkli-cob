import Link from 'next/link'
import { ArrowRight, GitBranch, Repeat, Workflow } from 'lucide-react'
import { Card } from '@/components/ui/card'

const reguas = [
  {
    title: 'Régua de cobrança',
    description: 'Etapas, prazos e ações automáticas para cobranças ativas.',
    href: '/app/regua-cobranca',
    icon: Workflow,
  },
  {
    title: 'Régua de acordo',
    description: 'Acompanhamento de parcelas, quebras, lembretes e retomadas.',
    href: '/app/regua-acordo',
    icon: Repeat,
  },
]

export default function ReguasHubPage() {
  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf8fb] text-[#04799a]">
            <GitBranch size={21} />
          </span>
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#04799a]">Comunicação</span>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Réguas operacionais</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Central única para acessar as réguas de cobrança e acordo sem duplicar itens no menu principal.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {reguas.map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href} className="group block">
              <Card className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:border-[#04799a]/40 group-hover:shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#edf8fb] text-[#04799a]">
                    <Icon size={20} />
                  </span>
                  <ArrowRight size={17} className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-[#04799a]" />
                </div>
                <h2 className="mt-4 text-base font-semibold text-slate-950">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
              </Card>
            </Link>
          )
        })}
      </section>
    </div>
  )
}
