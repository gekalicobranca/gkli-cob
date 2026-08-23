import { ClipboardCheck, FileText, Hourglass, Scale } from 'lucide-react'
import { PreJuridicoCasosBoard } from '@/components/pre-juridico/casos-board'
import { IniciarProcessamento } from '@/components/pre-juridico/iniciar-processamento'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ClearFiltersLink, ListFiltersForm, ListPanel, ListPanelHeader, ListSearchField, ListTitle, ListTitleBar } from '@/components/layout/list-page'
import { Button } from '@/components/ui/button'
import { listPreJuridicoCasos, listPreJuridicoCobrancas } from '@/features/pre-juridico/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

type Params = Promise<{ q?: string }>
const PREPARACAO = ['aguardando_documentos', 'aguardando_administradora', 'aguardando_sindico', 'pronto_juridico'] as const
const norm = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('pt-BR')
const relation = (value: any) => Array.isArray(value) ? value[0] : value

export default async function ProcessamentoPreJuridicoPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const [cobrancas, casos] = await Promise.all([listPreJuridicoCobrancas(scope), listPreJuridicoCasos(scope)])
  const casoPorCobranca = new Map(casos.filter((caso: any) => caso.cobranca_id).map((caso: any) => [caso.cobranca_id, caso]))
  const encaminhadas = cobrancas.filter((row: any) => row.situacao_pre_juridico === 'encaminhado')
  const aguardandoInicio = encaminhadas.filter((row: any) => !casoPorCobranca.has(row.id)).filter((row: any) => !params.q || norm([row.condominio?.nome, row.condominio?.nome_operacional, row.unidade?.identificacao, row.unidade?.responsavel_nome].join(' ')).includes(norm(params.q)))
  const emPreparacao = casos.filter((caso: any) => PREPARACAO.includes(caso.etapa)).filter((caso: any) => {
    if (!params.q) return true
    const condominio = relation(caso.condominio), unidade = relation(caso.unidade)
    return norm([condominio?.nome, condominio?.nome_operacional, unidade?.identificacao, unidade?.responsavel_nome].join(' ')).includes(norm(params.q))
  })

  return <div className="space-y-5">
    <PageHeader eyebrow="Pré-Jurídico" title="Processamento" description="Inicie o andamento, prepare os documentos e valide cada cobrança antes do envio ao jurídico." />
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Card className="p-4"><Hourglass size={19} className="text-amber-600" /><p className="mt-3 text-2xl font-semibold">{aguardandoInicio.length}</p><p className="text-sm text-slate-500">aguardando início</p></Card>
      <Card className="p-4"><FileText size={19} className="text-slate-600" /><p className="mt-3 text-2xl font-semibold">{emPreparacao.filter((row: any) => row.etapa === 'aguardando_documentos').length}</p><p className="text-sm text-slate-500">em documentos</p></Card>
      <Card className="p-4"><ClipboardCheck size={19} className="text-orange-600" /><p className="mt-3 text-2xl font-semibold">{emPreparacao.filter((row: any) => ['aguardando_administradora', 'aguardando_sindico'].includes(row.etapa)).length}</p><p className="text-sm text-slate-500">em validação</p></Card>
      <Card className="p-4"><Scale size={19} className="text-emerald-600" /><p className="mt-3 text-2xl font-semibold">{emPreparacao.filter((row: any) => row.etapa === 'pronto_juridico').length}</p><p className="text-sm text-slate-500">prontas para envio</p></Card>
    </section>
    <ListPanel>
      <ListPanelHeader className="bg-white/80"><ListTitleBar className="xl:items-center"><ListTitle title="Localizar processamento" description="Busque por condomínio, unidade ou responsável." /><ClearFiltersLink href="/app/pre-juridico/processamento" show={Boolean(params.q)} /></ListTitleBar><ListFiltersForm className="grid-cols-1 md:grid-cols-[1fr_120px]"><ListSearchField defaultValue={params.q} placeholder="Condomínio, unidade ou responsável..." /><Button type="submit" className="w-full">Filtrar</Button></ListFiltersForm></ListPanelHeader>
    </ListPanel>
    <ListPanel><ListPanelHeader><ListTitle title="Aguardando início" description="Cobranças encaminhadas que ainda não possuem um andamento operacional." /></ListPanelHeader><IniciarProcessamento rows={aguardandoInicio as any[]} /></ListPanel>
    <ListPanel><ListPanelHeader><ListTitle title="Etapas de preparação" description="Abra o cartão para registrar dados e avançar da conferência documental até ficar pronto para o jurídico." /></ListPanelHeader><div className="p-3"><PreJuridicoCasosBoard casos={emPreparacao as any[]} etapas={PREPARACAO} /></div></ListPanel>
  </div>
}
