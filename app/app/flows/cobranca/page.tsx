import { Layers, ListChecks, RadioTower, type LucideIcon } from 'lucide-react'
import { FlowCobrancaWorkbench } from '@/components/flows/cobranca/flow-cobranca-workbench'
import { ClearFiltersLink, ListFilterField, ListFiltersForm, ListKpiGrid, ListPage } from '@/components/layout/list-page'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { PageHeader } from '@/components/ui/page-header'
import { Select } from '@/components/ui/select'
import { ativarCobrancasFiltradasFlowCobranca } from '@/features/flows/cobranca/actions'
import { listCarteiras } from '@/features/carteiras/queries'
import { listCondominios } from '@/features/condominios/queries'
import { getFlowCobrancaPageData, hasFlowCobrancaFilters, normalizeFlowCobrancaFilters } from '@/features/flows/cobranca/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

type Params = Promise<{ step?: string; criados?: string; ativadas?: string; carteira?: string; condominio?: string; vencimento?: string }>

function safeStep(value: unknown) {
  const step = String(value ?? '')
  return ['disponibilidade', 'lotes', 'flows'].includes(step) ? step as any : 'disponibilidade'
}

export default async function FlowCobrancaPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const filters = normalizeFlowCobrancaFilters({
    carteiraId: params.carteira,
    condominioId: params.condominio,
    vencimentoAte: params.vencimento,
  })
  const hasFilters = hasFlowCobrancaFilters(filters)
  const [data, carteiras, condominios] = await Promise.all([
    getFlowCobrancaPageData(scope, filters),
    listCarteiras(scope),
    listCondominios(scope, filters.carteiraId ? { carteiraId: filters.carteiraId } : {}),
  ])
  const ativos = data.flows.filter((flow: any) => ['pronto', 'em_execucao', 'pausado'].includes(String(flow.status))).length
  const agendadas = data.flows.reduce((sum: number, flow: any) => sum + Number(flow.total_agendadas ?? 0), 0)
  const enviadas = data.flows.reduce((sum: number, flow: any) => sum + Number(flow.total_enviadas ?? 0), 0)
  const returnQuery = new URLSearchParams()
  if (filters.carteiraId) returnQuery.set('carteira', filters.carteiraId)
  if (filters.condominioId) returnQuery.set('condominio', filters.condominioId)
  if (filters.vencimentoAte) returnQuery.set('vencimento', filters.vencimentoAte)

  const kpis: Array<{ label: string; value: number; icon: LucideIcon; tone: string }> = [
    { label: 'Disponíveis', value: data.disponibilidade.length, icon: ListChecks, tone: 'bg-[#edf8fb] text-[#04799a]' },
    { label: 'Flows ativos', value: ativos, icon: Layers, tone: 'bg-violet-50 text-violet-700' },
    { label: 'Agendadas', value: agendadas, icon: RadioTower, tone: 'bg-amber-50 text-amber-700' },
    { label: 'Enviadas', value: enviadas, icon: ListChecks, tone: 'bg-emerald-50 text-emerald-700' },
  ]

  return <ListPage>
    <PageHeader
      eyebrow="Flows"
      title="Flow cobrança"
      description="Crie lotes a partir das cobranças novas, vincule uma régua, libere a agenda e monitore os disparos."
    />

    {params.criados ? (
      <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {params.criados} Flow(s) criado(s). Revise a lista e clique em Enviar para liberar a agenda da régua.
      </Card>
    ) : null}

    {params.ativadas ? (
      <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {params.ativadas} cobrança(s) filtrada(s) movida(s) para Cobrança ativa.
      </Card>
    ) : null}

    <ListKpiGrid>
      {kpis.map(({ label, value, icon: Icon, tone }) => <Card key={label} className="relative overflow-hidden p-3"><div className={`absolute right-4 top-3 rounded-lg p-2 ${tone}`}><Icon size={18} /></div><p className="text-xs font-medium uppercase text-slate-400">{label}</p><p className="mt-1.5 text-2xl font-semibold text-slate-950">{value}</p></Card>)}
    </ListKpiGrid>

    <Card className="p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Painel</h2>
          <p className="mt-1 text-sm text-slate-500">Filtre as cobranças novas e mova o recorte filtrado para Cobrança ativa.</p>
        </div>
        <form action={ativarCobrancasFiltradasFlowCobranca} className="flex shrink-0 justify-end">
          {data.disponibilidade.map((cobranca: any) => <input key={cobranca.id} type="hidden" name="cobranca_id" value={cobranca.id} />)}
          <input type="hidden" name="return_query" value={returnQuery.toString()} />
          <PendingSubmitButton disabled={!data.disponibilidade.length} pendingLabel="Atualizando...">Mover filtradas para Cobrança ativa</PendingSubmitButton>
        </form>
      </div>
      <ListFiltersForm action="/app/flows/cobranca" className="xl:grid-cols-[minmax(180px,0.9fr)_minmax(220px,1.2fr)_180px_auto_auto]">
        <ListFilterField label="Carteira">
          <Select name="carteira" defaultValue={filters.carteiraId ?? ''}>
            <option value="">Todas</option>
            {carteiras.map((carteira: any) => <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>)}
          </Select>
        </ListFilterField>
        <ListFilterField label="Condomínio">
          <Select name="condominio" defaultValue={filters.condominioId ?? ''}>
            <option value="">Todos</option>
            {condominios.map((condominio: any) => <option key={condominio.id} value={condominio.id}>{condominio.nome_operacional || condominio.nome}</option>)}
          </Select>
        </ListFilterField>
        <ListFilterField label="Vencimento">
          <Input type="date" name="vencimento" defaultValue={filters.vencimentoAte ?? ''} />
        </ListFilterField>
        <Button type="submit">Filtrar</Button>
        <ClearFiltersLink href="/app/flows/cobranca" show={hasFilters} />
      </ListFiltersForm>
    </Card>

    <FlowCobrancaWorkbench
      disponibilidade={data.disponibilidade as any[]}
      reguas={data.reguas as any[]}
      flows={data.flows as any[]}
      initialStep={safeStep(params.step)}
    />
  </ListPage>
}
