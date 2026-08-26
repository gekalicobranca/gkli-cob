import { Layers, ListChecks, Network, RadioTower } from 'lucide-react'
import { PreJuridicoFlowWorkbench } from '@/components/pre-juridico/flow-workbench'
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

  return <div className="space-y-5">
    <PageHeader
      eyebrow="Pré-Jurídico"
      title="Flow"
      description="Crie o lote, vincule a régua, libere o envio e monitore os disparos do pré-jurídico."
      actions={<div className="flex flex-wrap gap-2">
        <ButtonLink href="/app/pre-juridico/regua" variant="header"><Network size={16} />Réguas</ButtonLink>
        <ButtonLink href="/app/pre-juridico/lotes" variant="header"><Layers size={16} />Lotes</ButtonLink>
        <ButtonLink href="/app/pre-juridico/flow?step=flows" variant="header"><RadioTower size={16} />Monitor de flows</ButtonLink>
      </div>}
    />

    {params.criados ? (
      <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {params.criados} Flow(s) criado(s). Revise a lista e clique em Enviar para liberar a agenda da régua.
      </Card>
    ) : null}

    <section className="grid gap-3 md:grid-cols-4">
      <Card className="p-4"><ListChecks size={19} className="text-[#04799a]" /><p className="mt-3 text-2xl font-semibold">{data.disponibilidade.length}</p><p className="text-sm text-slate-500">procurações disponíveis</p></Card>
      <Card className="p-4"><Layers size={19} className="text-violet-600" /><p className="mt-3 text-2xl font-semibold">{ativos}</p><p className="text-sm text-slate-500">flows ativos</p></Card>
      <Card className="p-4"><RadioTower size={19} className="text-amber-600" /><p className="mt-3 text-2xl font-semibold">{agendadas}</p><p className="text-sm text-slate-500">mensagens agendadas</p></Card>
      <Card className="p-4"><ListChecks size={19} className="text-emerald-600" /><p className="mt-3 text-2xl font-semibold">{enviadas}</p><p className="text-sm text-slate-500">mensagens enviadas</p></Card>
    </section>

    <PreJuridicoFlowWorkbench
      disponibilidade={data.disponibilidade as any[]}
      reguas={data.reguas as any[]}
      flows={data.flows as any[]}
      initialStep={safeStep(params.step)}
    />
  </div>
}
