import { CheckCircle2, SearchCheck, Scale } from 'lucide-react'
import { PreJuridicoCasosBoard } from '@/components/pre-juridico/casos-board'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ListPanel, ListPanelHeader, ListTitle } from '@/components/layout/list-page'
import { listPreJuridicoCasos } from '@/features/pre-juridico/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

export default async function MonitorPreJuridicoPage() {
  const scope = await getPermittedCarteiras()
  const casos = await listPreJuridicoCasos(scope)
  const etapasMonitor = ['enviado_juridico', 'analise_juridica', 'pendencia_juridica', 'autorizado_ajuizamento', 'judicializado'] as const
  const casosMonitor = casos.filter((caso: any) => etapasMonitor.includes(caso.etapa))
  const noJuridico = casos.filter((caso: any) => ['enviado_juridico', 'analise_juridica', 'pendencia_juridica', 'autorizado_ajuizamento'].includes(caso.etapa)).length
  const judicializados = casos.filter((caso: any) => caso.etapa === 'judicializado').length

  return <div className="space-y-5">
    <PageHeader eyebrow="Pré-Jurídico" title="Monitor de casos" description="Acompanhe a passagem de cada caso pela validação, jurídico, autorização e judicialização." />
    <section className="grid gap-3 md:grid-cols-3">
      <Card className="p-4"><SearchCheck size={19} className="text-[#04799a]" /><p className="mt-3 text-2xl font-semibold">{casosMonitor.length}</p><p className="text-sm text-slate-500">casos monitorados</p></Card>
      <Card className="p-4"><Scale size={19} className="text-violet-600" /><p className="mt-3 text-2xl font-semibold">{noJuridico}</p><p className="text-sm text-slate-500">em tratamento pelo jurídico</p></Card>
      <Card className="p-4"><CheckCircle2 size={19} className="text-emerald-600" /><p className="mt-3 text-2xl font-semibold">{judicializados}</p><p className="text-sm text-slate-500">judicializados com processo</p></Card>
    </section>
    <ListPanel><ListPanelHeader><ListTitle title="Acompanhamento jurídico" description="Casos enviados ao jurídico, em análise, pendentes, autorizados ou judicializados." /></ListPanelHeader><div className="p-3"><PreJuridicoCasosBoard casos={casosMonitor as any[]} etapas={etapasMonitor} /></div></ListPanel>
  </div>
}
