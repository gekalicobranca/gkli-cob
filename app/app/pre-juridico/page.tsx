import { AlertTriangle, CheckCircle2, Clock3, Scale } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { CondominioSearchSelect } from '@/components/gestao/condominio-search-select'
import { ClearFiltersLink, ListFilterField, ListFiltersForm, ListPanel, ListPanelHeader, ListSearchField, ListTitle, ListTitleBar } from '@/components/layout/list-page'
import { PreJuridicoWorkbench } from '@/app/app/acordos/gestao/pre-juridico-workbench'
import { PreJuridicoModuleNav } from '@/components/pre-juridico/module-nav'
import { listAcordosQuebradosParaGestao } from '@/features/acordos/queries'
import { preJuridicoStepsCompletos } from '@/features/acordos/pre-juridico'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { formatCurrency } from '@/utils/formatters/currency'

type Params = Promise<{ q?: string; etapa?: string; condominio_id?: string }>

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function isEncaminhado(row: any) {
  const fluxo = normalize(row.fluxo_status)
  const cobranca = normalize(row.cobrancas?.status_operacional ?? row.cobrancas?.status)
  return fluxo.includes('pre_juridico') || cobranca.includes('pre_juridico')
}

function etapa(row: any) {
  if (isEncaminhado(row)) return 'encaminhado'
  return preJuridicoStepsCompletos(row.pre_juridico_steps) ? 'pronto' : 'documentacao'
}

export default async function PreJuridicoPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const baseRows = await listAcordosQuebradosParaGestao(scope)
  const termo = normalize(params.q)
  const etapaFiltro = normalize(params.etapa)
  const condominios = Array.from(new Map(baseRows.map((row: any) => [row.condominio_id, { id: row.condominio_id, nome: row.condominios?.nome ?? 'Condomínio não informado', administradora: null }])).values()).filter((row: any) => row.id).sort((a: any, b: any) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const rows = baseRows.filter((row: any) => {
    if (params.condominio_id && row.condominio_id !== params.condominio_id) return false
    if (etapaFiltro && etapa(row) !== etapaFiltro) return false
    if (!termo) return true
    return normalize([row.condominios?.nome, row.unidades?.identificacao, row.unidades?.responsavel_nome].filter(Boolean).join(' ')).includes(termo)
  })
  const entrada = baseRows.filter((row: any) => etapa(row) === 'documentacao')
  const prontos = baseRows.filter((row: any) => etapa(row) === 'pronto')
  const encaminhados = baseRows.filter((row: any) => etapa(row) === 'encaminhado')
  const valor = baseRows.reduce((sum: number, row: any) => sum + Number(row.valor_risco_operacional ?? row.valor_acordado ?? 0), 0)

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Pré-Jurídico" title="Painel de preparação" description="Organize documentos, valide impedimentos e encaminhe somente os casos prontos para o jurídico." />
      <PreJuridicoModuleNav active="painel" />
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Em documentação', value: entrada.length, detail: 'casos com etapa obrigatória pendente', icon: Clock3, tone: 'text-amber-700 bg-amber-50' },
          { label: 'Prontos para envio', value: prontos.length, detail: 'documentação obrigatória concluída', icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-50' },
          { label: 'Encaminhados', value: encaminhados.length, detail: 'casos que já saíram da preparação', icon: Scale, tone: 'text-violet-700 bg-violet-50' },
          { label: 'Valor em tratamento', value: formatCurrency(valor), detail: `${baseRows.length} caso(s) no escopo geral`, icon: AlertTriangle, tone: 'text-rose-700 bg-rose-50' },
        ].map(({ label, value, detail, icon: Icon, tone }) => (
          <Card key={label} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div>
              <span className={`rounded-xl p-2 ${tone}`}><Icon size={18} aria-hidden="true" /></span>
            </div>
          </Card>
        ))}
      </section>

      <ListPanel>
        <ListPanelHeader className="bg-white/80">
          <ListTitleBar className="xl:items-center"><ListTitle title="Filtros" description="Localize os casos por condomínio, unidade, responsável ou etapa." /><ClearFiltersLink href="/app/pre-juridico" show={Boolean(params.q || params.etapa || params.condominio_id)} /></ListTitleBar>
          <ListFiltersForm className="grid-cols-1 md:grid-cols-2 xl:grid-cols-12">
            <ListSearchField defaultValue={params.q} placeholder="Unidade ou responsável..." className="xl:col-span-4" />
            <ListFilterField label="Condomínio" className="xl:col-span-5"><CondominioSearchSelect name="condominio_id" options={condominios as any[]} selectedId={params.condominio_id ?? ''} defaultToFirst={false} inputClassName="" /></ListFilterField>
            <ListFilterField label="Etapa" className="xl:col-span-2"><Select name="etapa" defaultValue={params.etapa ?? ''}><option value="">Todas</option><option value="documentacao">Em documentação</option><option value="pronto">Prontos</option><option value="encaminhado">Encaminhados</option></Select></ListFilterField>
            <Button type="submit" className="w-full xl:col-span-1">Filtrar</Button>
          </ListFiltersForm>
        </ListPanelHeader>
      </ListPanel>

      <PreJuridicoWorkbench rows={rows} />
    </div>
  )
}
