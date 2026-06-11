import { ArrowUpRight, CheckCircle2, FileSpreadsheet, Layers3, Search, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { relatorioCards } from '@/features/relatorios/catalog'

export const dynamic = 'force-dynamic'

export default function RelatoriosPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Gestão"
        title="Relatórios"
        description="Central gerencial para cruzar carteiras, condomínios, administradoras, cobranças e acordos. Cada relatório nasce com versão sintética em lista e detalhada em ficha."
        actions={
          <ButtonLink href="/app/dashboard" variant="secondary">
            <ArrowUpRight size={16} />
            Dashboard
          </ButtonLink>
        }
      />

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
            <Layers3 size={18} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Homologados</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{relatorioCards.length}</p>
          <p className="mt-1 text-sm text-slate-500">relatórios iniciais</p>
        </Card>
        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-emerald-50 p-2 text-emerald-700">
            <CheckCircle2 size={18} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Formatos</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">2</p>
          <p className="mt-1 text-sm text-slate-500">lista e ficha</p>
        </Card>
        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-amber-50 p-2 text-amber-700">
            <FileSpreadsheet size={18} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Próxima etapa</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">XLSX</p>
          <p className="mt-1 text-sm text-slate-500">exportação operacional</p>
        </Card>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-base font-medium text-slate-950">Relatórios disponíveis</h2>
              <p className="mt-1 text-sm text-slate-500">Cards no mesmo padrão visual das importações, mas voltados para leitura gerencial.</p>
            </div>
            <div className="relative md:w-[360px]">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input className="pl-9" placeholder="Buscar relatório..." />
            </div>
          </div>
        </div>

        <section className="grid gap-4 p-5 lg:grid-cols-2 2xl:grid-cols-4">
          {relatorioCards.map((card) => {
            const Icon = card.icon
            return (
              <Card key={card.tipo} className="group flex h-full flex-col justify-between overflow-hidden p-0 transition hover:-translate-y-0.5 hover:border-[var(--gkli-primary)]/35 hover:shadow-[0_22px_50px_-36px_rgba(15,23,42,.55)]">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-3 text-[var(--gkli-primary)]"><Icon size={21} /></div>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">Gestão</span>
                  </div>
                  <h2 className="mt-4 text-lg font-medium tracking-tight text-slate-950">{card.title}</h2>
                  <p className="mt-2 min-h-[72px] text-sm leading-6 text-slate-600">{card.description}</p>
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <p className="flex items-start gap-2 text-xs leading-5 text-slate-600"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[var(--gkli-primary)]" />Sintético: {card.sintetico}.</p>
                    <p className="mt-2 text-xs text-slate-500">Detalhado: {card.detalhado}.</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row">
                  <ButtonLink href={`/app/gestao/relatorios/${card.tipo}?modo=sintetico`} className="justify-center !text-white [&_svg]:!text-white">
                    Lista
                  </ButtonLink>
                  <ButtonLink href={`/app/gestao/relatorios/${card.tipo}?modo=detalhado`} variant="secondary" className="justify-center">
                    Ficha
                  </ButtonLink>
                </div>
              </Card>
            )
          })}
        </section>
      </Card>
    </div>
  )
}
