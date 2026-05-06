import { PageHeader } from '@/components/ui/page-header'
import { MetricCard } from '@/components/data/metric-card'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function Page() {
  return (
    <div>
      <PageHeader eyebrow="Gestão" title="Carteiras x Usuários" description="Gerencie o vínculo de usuários com carteiras autorizadas." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Usuários ativos" value="—" description="Aguardando dados reais do Supabase" />
        <MetricCard label="Carteiras ativas" value="—" description="Aguardando dados reais do Supabase" />
        <MetricCard label="Vínculos" value="—" description="Aguardando dados reais do Supabase" />
        <MetricCard label="Sem acesso" value="—" description="Aguardando dados reais do Supabase" />
      </section>
      <Card className="mt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Estrutura V1</h2>
            <p className="mt-1 text-sm text-slate-600">Página no padrão GKLI, pronta para conectar queries, filtros, ações e tabelas reais.</p>
          </div>
          <Badge>GKLI padrão</Badge>
        </div>
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          Próximo passo: conectar este módulo ao schema Supabase e aplicar escopo por carteira em todas as consultas.
        </div>
      </Card>
    </div>
  )
}
