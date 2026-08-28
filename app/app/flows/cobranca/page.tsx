import { FileText, Layers, ListChecks, Network, WalletCards, type LucideIcon } from 'lucide-react'
import { CondominioSearchSelect } from '@/components/gestao/condominio-search-select'
import { FlowCobrancaPainelWorkbench } from '@/components/flows/cobranca/cobrancas-painel-workbench'
import { FlowCobrancaWorkbench } from '@/components/flows/cobranca/flow-cobranca-workbench'
import { ClearFiltersLink, ListCollapsibleFilters, ListFilterField, ListFiltersForm, ListKpiGrid, ListPage } from '@/components/layout/list-page'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Select } from '@/components/ui/select'
import { listCarteiras } from '@/features/carteiras/queries'
import { listCondominios } from '@/features/condominios/queries'
import { getFlowCobrancaPageData, hasFlowCobrancaFilters, normalizeFlowCobrancaFilters } from '@/features/flows/cobranca/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { formatCurrency } from '@/utils/formatters/currency'

type Params = Promise<{ step?: string; criados?: string; ativadas?: string; selecionadas?: string; carteira?: string; condominio?: string; vencimento?: string; vencimento_de?: string; vencimento_ate?: string }>

function safeStep(value: unknown) {
  const step = String(value ?? '')
  return ['lotes', 'flows'].includes(step) ? step as any : undefined
}

function selectedIds(value: unknown) {
  return String(value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

export default async function FlowCobrancaPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const filters = normalizeFlowCobrancaFilters({
    carteiraId: params.carteira,
    condominioId: params.condominio,
    vencimentoDe: params.vencimento_de,
    vencimentoAte: params.vencimento_ate ?? params.vencimento,
  })
  const hasFilters = hasFlowCobrancaFilters(filters)
  const [data, carteiras, condominios] = await Promise.all([
    getFlowCobrancaPageData(scope, filters),
    listCarteiras(scope),
    listCondominios(scope, filters.carteiraId ? { carteiraId: filters.carteiraId } : {}),
  ])
  const ativos = data.flows.filter((flow: any) => ['pronto', 'em_execucao', 'pausado'].includes(String(flow.status))).length
  const painelRows = (data.painel ?? []) as any[]
  const disponibilidadeRows = (data.disponibilidade ?? []) as any[]
  const selecionadas = selectedIds(params.selecionadas)
  const valorNovo = painelRows.reduce((sum: number, row: any) => sum + Number(row.valor_atualizado ?? row.valor_original ?? 0), 0)
  const unidades = new Set(painelRows.map((row: any) => row.unidade_id).filter(Boolean)).size
  const returnQuery = new URLSearchParams()
  if (filters.carteiraId) returnQuery.set('carteira', filters.carteiraId)
  if (filters.condominioId) returnQuery.set('condominio', filters.condominioId)
  if (filters.vencimentoDe) returnQuery.set('vencimento_de', filters.vencimentoDe)
  if (filters.vencimentoAte) returnQuery.set('vencimento_ate', filters.vencimentoAte)

  const kpis: Array<{ label: string; value: string | number; icon?: LucideIcon; tag?: string; tagClass?: string; tone?: string }> = [
    { label: 'Valor novo', value: formatCurrency(valorNovo), icon: WalletCards, tone: 'bg-[var(--gkli-primary-light)] text-[var(--gkli-primary)]' },
    { label: 'Novas', value: painelRows.length, tag: 'painel', tagClass: 'bg-emerald-50 text-emerald-700' },
    { label: 'Flows ativos', value: ativos, icon: Layers, tone: 'bg-violet-50 text-violet-700' },
    { label: 'Unidades', value: unidades, icon: ListChecks, tone: 'bg-blue-50 text-blue-700' },
  ]

  return <ListPage>
    <PageHeader
      eyebrow="Flows"
      title="Flow cobrança"
      description="Crie lotes a partir das cobranças novas, vincule uma régua, libere a agenda e monitore os disparos."
      actions={<div className="flex flex-wrap gap-2">
        <ButtonLink href="/app/regua-cobranca" variant="header"><Network size={16} />Réguas</ButtonLink>
        <ButtonLink href="/app/mensageria/templates?tipo=cobranca" variant="header"><FileText size={16} />Templates</ButtonLink>
      </div>}
    />

    {params.criados ? (
      <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {params.criados} Flow(s) criado(s). Revise a lista e clique em Enviar para liberar a agenda da régua.
      </Card>
    ) : null}

    {params.ativadas ? (
      <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {params.ativadas} cobrança(s) ativada(s). Escolha a régua no lote abaixo para criar o Flow.
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

    <ListCollapsibleFilters defaultOpen={hasFilters} actions={<ClearFiltersLink href="/app/flows/cobranca" show={hasFilters} />}>
      <ListFiltersForm action="/app/flows/cobranca" className="grid-cols-1 md:grid-cols-2 xl:grid-cols-10">
        <ListFilterField label="Carteira" className="xl:col-span-2"><Select name="carteira" defaultValue={filters.carteiraId ?? ''}><option value="">Todas</option>{carteiras.map((carteira: any) => <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>)}</Select></ListFilterField>
        <ListFilterField label="Condomínio" className="xl:col-span-3"><CondominioSearchSelect name="condominio" options={condominios.map((row: any) => ({ id: row.id, nome: row.nome_operacional || row.nome || 'Condomínio não informado', administradora: null })) as any[]} selectedId={filters.condominioId ?? ''} defaultToFirst={false} inputClassName="" /></ListFilterField>
        <ListFilterField label="Vencimento de" className="xl:col-span-2"><Input type="date" name="vencimento_de" defaultValue={filters.vencimentoDe ?? ''} /></ListFilterField>
        <ListFilterField label="Vencimento até" className="xl:col-span-2"><Input type="date" name="vencimento_ate" defaultValue={filters.vencimentoAte ?? ''} /></ListFilterField>
        <Button type="submit" className="w-full xl:col-span-1">Filtrar</Button>
      </ListFiltersForm>
    </ListCollapsibleFilters>

    <FlowCobrancaPainelWorkbench rows={painelRows} returnQuery={returnQuery.toString()} />

    <FlowCobrancaWorkbench
      disponibilidade={disponibilidadeRows}
      reguas={data.reguas as any[]}
      flows={data.flows as any[]}
      initialStep={safeStep(params.step)}
      initialSelectedIds={selecionadas}
    />
  </ListPage>
}
