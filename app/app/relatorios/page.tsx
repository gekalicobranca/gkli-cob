import { AlertTriangle, FileText, TrendingUp } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'

export default function RelatoriosPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Gestão"
        title="Relatórios"
        description="Relatórios sintéticos, detalhados e versões de impressão para gestão operacional."
        actions={<ButtonLink href="/app/dashboard" variant="secondary">Voltar</ButtonLink>}
      />

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Acordos</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">Recuperação</h2>
              <p className="mt-1 text-sm text-slate-500">Carteiras e condomínios com valor acordado, recuperado e saldo.</p>
            </div>
            <TrendingUp size={20} className="text-[var(--gkli-primary)]" />
          </div>
          <ButtonLink href="/app/relatorios/acordos-recuperacao" className="mt-4"><FileText size={16} />Abrir relatório</ButtonLink>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Acordos</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">Rompimentos</h2>
              <p className="mt-1 text-sm text-slate-500">Rompimentos por condomínio, com lista detalhada dos acordos.</p>
            </div>
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <ButtonLink href="/app/relatorios/acordos-rompimentos" className="mt-4"><FileText size={16} />Abrir relatório</ButtonLink>
        </Card>
      </section>
    </div>
  )
}
