import Link from 'next/link'
import { AlertTriangle, ArrowRight, CalendarClock, MessageCircle, Sparkles } from 'lucide-react'
import { MobileBottomActions } from '@/components/mobile/mobile-bottom-actions'

const items = [
  {
    id: 'demo-1',
    title: 'Promessa vence hoje',
    description: 'Unidade 1204 · Condomínio Jardim Norte',
    tag: 'Alta',
    href: '/app/workspace/demo-1/mobile',
  },
  {
    id: 'demo-2',
    title: 'Negociação quente',
    description: 'Proposta enviada ontem aguardando retorno',
    tag: 'Média',
    href: '/app/workspace/demo-2/mobile',
  },
  {
    id: 'demo-3',
    title: 'Sem resposta há 5 dias',
    description: 'Recomendado novo contato no fim do dia',
    tag: 'Atenção',
    href: '/app/workspace/demo-3/mobile',
  },
]

export function MobileOperationalHome() {
  return (
    <div className="min-h-screen bg-slate-50 pb-28 md:pb-6">
      <section className="rounded-b-[2rem] bg-slate-950 p-5 text-white shadow-sm md:rounded-[2rem]">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#d7eef5]">
          <Sparkles size={14} />
          Mobile Lite
        </span>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Operação no bolso
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-300">
          Inbox, agenda e ações rápidas em uma experiência mobile-first.
        </p>
      </section>

      <main className="space-y-4 p-4">
        <section className="grid grid-cols-3 gap-2">
          <div className="rounded-3xl border bg-white p-3 shadow-sm">
            <AlertTriangle size={18} className="text-rose-600" />
            <strong className="mt-3 block text-2xl text-slate-950">7</strong>
            <span className="text-xs text-slate-500">Críticos</span>
          </div>

          <div className="rounded-3xl border bg-white p-3 shadow-sm">
            <CalendarClock size={18} className="text-[#04799a]" />
            <strong className="mt-3 block text-2xl text-slate-950">12</strong>
            <span className="text-xs text-slate-500">Hoje</span>
          </div>

          <div className="rounded-3xl border bg-white p-3 shadow-sm">
            <MessageCircle size={18} className="text-sky-600" />
            <strong className="mt-3 block text-2xl text-slate-950">5</strong>
            <span className="text-xs text-slate-500">Retornos</span>
          </div>
        </section>

        <section className="rounded-[2rem] border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Fila recomendada</h2>
          <p className="mt-1 text-sm text-slate-500">Prioridade contextual para hoje.</p>

          <div className="mt-4 space-y-3">
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="flex items-center justify-between gap-3 rounded-3xl border border-slate-200 p-4 transition hover:border-[#04799a]/30"
              >
                <div className="min-w-0">
                  <span className="rounded-full bg-[#f5fbfd] px-2.5 py-1 text-xs font-semibold text-[#04799a]">
                    {item.tag}
                  </span>
                  <strong className="mt-2 block truncate text-sm text-slate-950">{item.title}</strong>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.description}</p>
                </div>

                <ArrowRight size={18} className="shrink-0 text-slate-400" />
              </Link>
            ))}
          </div>
        </section>
      </main>

      <MobileBottomActions />
    </div>
  )
}
