import { FileText, Layers, ListChecks, Network, RadioTower, type LucideIcon } from 'lucide-react'
import { PreJuridicoFlowWorkbench } from '@/components/pre-juridico/flow-workbench'
import { ListKpiGrid, ListPage } from '@/components/layout/list-page'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { getPreJuridicoFlowPageData } from '@/features/pre-juridico/flow-queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

type Params = Promise<{ step?: string; criados?: string }>

function safeStep(value: unknown) {
  const step = String(value ?? '')
  return ['disponibilidade', 'lotes', 'flows'].includes(step) ? step as any : 'disponibilidade'
}

export default async function FlowPreJuridicoPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const data = await getPreJuridicoFlowPageData(scope)
  const ativos = data.flows.filter((flow: any) => ['pronto', 'em_execucao', 'pausado'].includes(String(flow.status))).length
  const agendadas = data.flows.reduce((sum: number, flow: any) => sum + Number(flow.total_agendadas ?? 0), 0)
  const enviadas = data.flows.reduce((sum: number, flow: any) => sum + Number(flow.total_enviadas ?? 0), 0)

  const kpis: Array<{ label: string; value: number; icon: LucideIcon; tone: string }> = [
    { label: 'Disponíveis', value: data.disponibilidade.length, icon: ListChecks, tone: 'bg-[#edf8fb] text-[#04799a]' },
    { label: 'Flows ativos', value: ativos, icon: Layers, tone: 'bg-violet-50 text-violet-700' },
    { label: 'Agendadas', value: agendadas, icon: RadioTower, tone: 'bg-amber-50 text-amber-700' },
    { label: 'Enviadas', value: enviadas, icon: ListChecks, tone: 'bg-emerald-50 text-emerald-700' },
  ]

  return <ListPage>
    <PageHeader
      eyebrow="Pré-Jurídico"
      title="Flow"
      description="Crie o lote, vincule a régua, libere o envio e monitore os disparos do pré-jurídico."
      actions={<div className="flex flex-wrap gap-2">
        <ButtonLink href="/app/pre-juridico/regua" variant="header"><Network size={16} />Réguas</ButtonLink>
        <ButtonLink href="/app/mensageria/templates?tipo=juridico" variant="header"><FileText size={16} />Templates</ButtonLink>
      </div>}
    />

    {params.criados ? (
      <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {params.criados} Flow(s) criado(s). Revise a lista e clique em Enviar para liberar a agenda da régua.
      </Card>
    ) : null}

    <ListKpiGrid>
      {kpis.map(({ label, value, icon: Icon, tone }) => <Card key={label} className="relative overflow-hidden p-3"><div className={`absolute right-4 top-3 rounded-lg p-2 ${tone}`}><Icon size={18} /></div><p className="text-xs font-medium uppercase text-slate-400">{label}</p><p className="mt-1.5 text-2xl font-semibold text-slate-950">{value}</p></Card>)}
    </ListKpiGrid>

    <PreJuridicoFlowWorkbench
      disponibilidade={data.disponibilidade as any[]}
      reguas={data.reguas as any[]}
      flows={data.flows as any[]}
      initialStep={safeStep(params.step)}
    />
  </ListPage>
}
