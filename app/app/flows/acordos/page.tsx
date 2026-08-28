import { FileText, Layers, Network, RadioTower, WalletCards, type LucideIcon } from 'lucide-react'
import { CondominioSearchSelect } from '@/components/gestao/condominio-search-select'
import { FlowAcordosWorkbench } from '@/components/flows/acordos/flow-acordos-workbench'
import { ClearFiltersLink, ListCollapsibleFilters, ListFilterField, ListFiltersForm, ListKpiGrid, ListPage } from '@/components/layout/list-page'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Select } from '@/components/ui/select'
import { listCarteiras } from '@/features/carteiras/queries'
import { listCondominios } from '@/features/condominios/queries'
import { getFlowAcordosPageData, hasFlowAcordosFilters, normalizeFlowAcordosFilters } from '@/features/flows/acordos/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { formatCurrency } from '@/utils/formatters/currency'

type Params = Promise<{ step?: string; criados?: string; carteira?: string; condominio?: string; vencimento_de?: string; vencimento_ate?: string }>

function safeStep(value: unknown) {
  const step = String(value ?? '')
  return ['painel', 'lotes', 'flows'].includes(step) ? step as any : undefined
}

export default async function FlowAcordosPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const filters = normalizeFlowAcordosFilters({
    carteiraId: params.carteira,
    condominioId: params.condominio,
    vencimentoDe: params.vencimento_de,
    vencimentoAte: params.vencimento_ate,
  })
  const hasFilters = hasFlowAcordosFilters(filters)
  const [data, carteiras, condominios] = await Promise.all([
    getFlowAcordosPageData(scope, filters),
    listCarteiras(scope),
    listCondominios(scope, filters.carteiraId ? { carteiraId: filters.carteiraId } : {}),
  ])
  const parcelas = (data.parcelas ?? []) as any[]
  const ativos = data.flows.filter((flow: any) => ['pronto', 'em_execucao', 'pausado'].includes(String(flow.status))).length
  const agendadas = data.flows.reduce((sum: number, flow: any) => sum + Number(flow.total_agendadas ?? 0), 0)
  const enviadas = data.flows.reduce((sum: number, flow: any) => sum + Number(flow.total_enviadas ?? 0), 0)
  const valorAberto = parcelas.reduce((sum: number, row: any) => sum + Number(row.valor ?? 0), 0)

  const kpis: Array<{ label: string; value: string | number; icon?: LucideIcon; tag?: string; tagClass?: string; tone?: string }> = [
    { label: 'Valor em parcelas', value: formatCurrency(valorAberto), icon: WalletCards, tone: 'bg-[var(--gkli-primary-light)] text-[var(--gkli-primary)]' },
    { label: 'Parcelas ativas', value: parcelas.length, tag: 'pagamento', tagClass: 'bg-emerald-50 text-emerald-700' },
    { label: 'Flows ativos', value: ativos, icon: Layers, tone: 'bg-violet-50 text-violet-700' },
    { label: 'Agendadas / enviadas', value: `${agendadas}/${enviadas}`, icon: RadioTower, tone: 'bg-amber-50 text-amber-700' },
  ]

  return <ListPage>
    <PageHeader
      eyebrow="Flows"
      title="Flow acordos"
      description="Monte lembretes de pagamento para parcelas geradas/ativas de acordos, vincule uma régua e monitore os disparos."
      actions={<div className="flex flex-wrap gap-2">
        <ButtonLink href="/app/regua-acordo" variant="header"><Network size={16} />Réguas</ButtonLink>
        <ButtonLink href="/app/mensageria/templates?tipo=acordo" variant="header"><FileText size={16} />Templates</ButtonLink>
      </div>}
    />

    {params.criados ? (
      <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {params.criados} Flow(s) criado(s). Revise a lista e clique em Enviar para liberar a agenda da régua.
      </Card>
    ) : null}

    <ListKpiGrid>
      {kpis.map(({ label, value, icon: Icon, tag, tagClass, tone }) => <Card key={label} className="relative overflow-hidden p-3">
        {Icon ? <div className={`absolute right-4 top-3 rounded-lg p-2 ${tone}`}><Icon size={18} /></div> : null}
        <p className="text-xs font-medium uppercase text-slate-400">{label}</p>
        <div className="mt-1.5 flex items-end justify-between gap-3">
          <p className="text-2xl font-semibold text-slate-950">{value}</p>
          {tag ? <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tagClass}`}>{tag}</span> : null}
        </div>
      </Card>)}
    </ListKpiGrid>

    <ListCollapsibleFilters defaultOpen={hasFilters} actions={<ClearFiltersLink href="/app/flows/acordos" show={hasFilters} />}>
      <ListFiltersForm action="/app/flows/acordos" className="grid-cols-1 md:grid-cols-2 xl:grid-cols-10">
        <ListFilterField label="Carteira" className="xl:col-span-2"><Select name="carteira" defaultValue={filters.carteiraId ?? ''}><option value="">Todas</option>{carteiras.map((carteira: any) => <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>)}</Select></ListFilterField>
        <ListFilterField label="Condomínio" className="xl:col-span-3"><CondominioSearchSelect name="condominio" options={condominios.map((row: any) => ({ id: row.id, nome: row.nome_operacional || row.nome || 'Condomínio não informado', administradora: null })) as any[]} selectedId={filters.condominioId ?? ''} defaultToFirst={false} inputClassName="" /></ListFilterField>
        <ListFilterField label="Vencimento de" className="xl:col-span-2"><Input type="date" name="vencimento_de" defaultValue={filters.vencimentoDe ?? ''} /></ListFilterField>
        <ListFilterField label="Vencimento até" className="xl:col-span-2"><Input type="date" name="vencimento_ate" defaultValue={filters.vencimentoAte ?? ''} /></ListFilterField>
        <Button type="submit" className="w-full xl:col-span-1">Filtrar</Button>
      </ListFiltersForm>
    </ListCollapsibleFilters>

    <FlowAcordosWorkbench
      parcelas={parcelas}
      reguas={data.reguas as any[]}
      flows={data.flows as any[]}
      initialStep={safeStep(params.step)}
    />
  </ListPage>
}
