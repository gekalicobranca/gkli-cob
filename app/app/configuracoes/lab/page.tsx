import Link from 'next/link'
import { ArrowRight, Bot, FlaskConical, MonitorSmartphone, Sparkles, Target } from 'lucide-react'
import { Card } from '@/components/ui/card'

const experiments = [
  {
    title: 'Agenda do Maestro',
    description: 'Agenda mensal, coleta de relatórios e validações do ciclo de captação automatizada, agora centralizadas no Maestro.',
    href: '/app/agente-automatico/maestro?aba=agenda',
    icon: Bot,
  },
  {
    title: 'Lite legado',
    description: 'Protótipo original da experiência Lite, preservado para referência de produto.',
    href: '/app/configuracoes/lab/lite',
    icon: Sparkles,
  },
  {
    title: 'Mobile operacional',
    description: 'Experiência mobile em validação, isolada da operação principal.',
    href: '/app/configuracoes/lab/mobile',
    icon: MonitorSmartphone,
  },
  {
    title: 'Workspace Focus',
    description: 'Layout experimental de resolução em três colunas.',
    href: '/app/configuracoes/lab/workspace/demo/focus',
    icon: Target,
  },
  {
    title: 'Workspace Smart',
    description: 'Protótipo com inteligência contextual expandida.',
    href: '/app/configuracoes/lab/workspace/demo/smart',
    icon: Sparkles,
  },
  {
    title: 'Workspace Mobile',
    description: 'Protótipo mobile do atendimento de caso.',
    href: '/app/configuracoes/lab/workspace/demo/mobile',
    icon: MonitorSmartphone,
  },
]

export default function LabPage() {
  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
        <div className="pointer-events-none absolute right-8 top-0 h-48 w-48 rounded-full bg-[#04799a]/35 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#d7eef5] ring-1 ring-white/15">
            <FlaskConical size={22} />
          </span>
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d7eef5]">Configurações · Lab</span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Laboratório experimental</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Protótipos, UXs alternativas e automações beta ficam aqui para preservar a operação principal limpa, previsível e focada.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {experiments.map((item) => {
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
