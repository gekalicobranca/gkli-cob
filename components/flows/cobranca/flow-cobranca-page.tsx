import { FileText, Layers, ListChecks, Network, WalletCards, type LucideIcon } from 'lucide-react'
import { FlowScopeFilters } from './flow-scope-filters'
import { FlowCobrancaNav } from './flow-cobranca-nav'
import { FlowWorkerProvider } from './flow-worker-status'
import { FlowCobrancaAbas } from '@/components/flows/cobranca/flow-cobranca-abas'
import { MaestroMontagens } from '@/components/flows/cobranca/maestro-montagens'
import { ClearFiltersLink, ListCollapsibleFilters, ListFilterField, ListFiltersForm, ListKpiGrid, ListPage } from '@/components/layout/list-page'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Select } from '@/components/ui/select'
import { getFlowCobrancaPageData, getFlowCobrancaMonitorData, searchFlowCondominios, listFlowCarteiras, COBRANCAS_FLOW_PAGE_SIZE, FLOWS_PAGE_SIZE, hasFlowCobrancaFilters, normalizeFlowCobrancaFilters } from '@/features/flows/cobranca/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { formatCurrency } from '@/utils/formatters/currency'
import { flowCobrancaPath, flowCobrancaAba, flowCobrancaPagina, flowCobrancaOrdem, flowCobrancaStatus, type CanalFlowCobranca } from '@/features/flows/cobranca/rotas'

export type FlowCobrancaParams = Promise<{ aba?: string; pagina?: string; ordenar?: string; status?: string; canal?: string; step?: string; criados?: string; ativadas?: string; selecionadas?: string; carteira?: string; condominio?: string; vencimento?: string; vencimento_de?: string; vencimento_ate?: string; inclusao_de?: string; inclusao_ate?: string }>

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

export async function FlowCobrancaPage({ searchParams, canal }: { searchParams: FlowCobrancaParams; canal: CanalFlowCobranca }) {
  const params = await searchParams
  const basePath = flowCobrancaPath(canal)
  const canalLabel = canal === 'email' ? 'E-mail' : 'WhatsApp'
  const aba = flowCobrancaAba(params.aba, canal, params.step)
  const page = flowCobrancaPagina(params.pagina)
  const status = flowCobrancaStatus(params.status, aba)
  const ordenar = flowCobrancaOrdem(params.ordenar)
  const monitor = aba === 'flows' || aba === 'historico'
  const detalhesCobrancas = aba === 'gerar' || aba === 'saneamento'
  const scope = await getPermittedCarteiras()
  const filters = normalizeFlowCobrancaFilters({
    canal,
    carteiraId: params.carteira,
    condominioId: params.condominio,
    vencimentoDe: detalhesCobrancas ? params.vencimento_de : undefined,
    vencimentoAte: detalhesCobrancas ? params.vencimento_ate ?? params.vencimento : undefined,
    inclusaoDe: aba !== 'maestro' ? params.inclusao_de : undefined,
    inclusaoAte: aba !== 'maestro' ? params.inclusao_ate : undefined,
  })
  const hasFilters = hasFlowCobrancaFilters({ ...filters, canal: undefined }) || Boolean(monitor && (status || ordenar !== 'criacao_desc'))
  const dataPromise = monitor
    ? getFlowCobrancaMonitorData(scope, filters, { page, historico: aba === 'historico', status, ordenar })
    : aba === 'saneamento' || aba === 'gerar'
      ? getFlowCobrancaPageData(scope, filters, { somenteSaneamento: aba === 'saneamento', page })
      : Promise.resolve({ painel: [], disponibilidade: [], saneamento: [], reguas: [], flows: [], hasNext: false })
  const [data, carteiras, condominios] = await Promise.all([
    dataPromise,
    listFlowCarteiras(scope),
    filters.condominioId ? searchFlowCondominios(scope, { id: filters.condominioId, carteiraId: filters.carteiraId }) : Promise.resolve([]),
  ])
  const painelRows = (data.painel ?? []) as any[]
  const disponibilidadeRows = (data.disponibilidade ?? []) as any[]
  const selecionadas = selectedIds(params.selecionadas)
  const valorNovo = painelRows.reduce((sum: number, row: any) => sum + Number(row.valor_atualizado ?? row.valor_original ?? 0), 0)
  const unidades = new Set(painelRows.map((row: any) => row.unidade_id).filter(Boolean)).size
  const returnQuery = new URLSearchParams({ aba })
  if (monitor) returnQuery.set('ordenar', ordenar)
  if (monitor && status) returnQuery.set('status', status)
  if (filters.canal) returnQuery.set('canal', filters.canal)
  if (filters.carteiraId) returnQuery.set('carteira', filters.carteiraId)
  if (filters.condominioId) returnQuery.set('condominio', filters.condominioId)
  if (filters.vencimentoDe) returnQuery.set('vencimento_de', filters.vencimentoDe)
  if (filters.vencimentoAte) returnQuery.set('vencimento_ate', filters.vencimentoAte)
  if (filters.inclusaoDe) returnQuery.set('inclusao_de', filters.inclusaoDe)
  if (filters.inclusaoAte) returnQuery.set('inclusao_ate', filters.inclusaoAte)

  const kpis: Array<{ label: string; value: string | number; icon?: LucideIcon; tag?: string; tagClass?: string; tone?: string }> = monitor ? [
    { label: 'Flows nesta página', value: data.flows.length, icon: Layers },
    { label: aba === 'historico' ? 'Flows concluídos' : 'Prontos para ativar', value: data.flows.filter(flow => aba === 'historico' ? ['concluido', 'concluido_com_falhas'].includes(flow.status) : flow.status === 'pronto').length },
    { label: aba === 'historico' ? 'Mensagens enviadas' : 'Mensagens agendadas', value: data.flows.reduce((sum, flow) => sum + Number(aba === 'historico' ? flow.total_enviadas ?? 0 : flow.total_agendadas ?? 0), 0) },
    { label: 'Falhas para revisar', value: data.flows.reduce((sum, flow) => sum + Number(flow.total_falhas ?? 0), 0) },
  ] : [
    { label: 'Valor novo', value: formatCurrency(valorNovo), icon: WalletCards, tone: 'bg-[var(--gkli-primary-light)] text-[var(--gkli-primary)]' },
    { label: 'Novas', value: painelRows.length, tag: 'painel', tagClass: 'bg-emerald-50 text-emerald-700' },
    { label: 'Cobranças ativas', value: disponibilidadeRows.length, icon: Layers, tone: 'bg-violet-50 text-violet-700' },
    { label: 'Unidades', value: unidades, icon: ListChecks, tone: 'bg-blue-50 text-blue-700' },
  ]

  const hasNext = data.hasNext
  function pageHref(nextPage: number) {
    const query = new URLSearchParams(returnQuery)
    query.set('pagina', String(nextPage))
    return `${basePath}?${query}`
  }

  return <ListPage>
    <PageHeader
      eyebrow="Flows"
      title={`Flows de cobrança · ${canalLabel}`}
      actions={<div className="flex flex-wrap gap-2">
        <ButtonLink href="/app/regua-cobranca" variant="header"><Network size={16} />Réguas</ButtonLink>
        <ButtonLink href="/app/mensageria/templates?tipo=cobranca" variant="header"><FileText size={16} />Templates</ButtonLink>
      </div>}
    />

    {params.criados ? (
      <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {params.criados} Flow(s) criado(s). Revise os flows e use Ativar ou Retomar para liberar a agenda da régua.
      </Card>
    ) : null}

    {params.ativadas ? (
      <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {params.ativadas} cobrança(s) ativada(s). Escolha a régua no lote abaixo para criar o Flow.
      </Card>
    ) : null}

    <FlowCobrancaNav canal={canal} aba={aba} query={returnQuery.toString()} />

    {monitor || aba === 'gerar' ? <ListKpiGrid>
      {kpis.map(({ label, value, icon: Icon, tag, tagClass, tone }) => <Card key={label} className="relative overflow-hidden p-3">
        {Icon ? <div className={`absolute right-4 top-3 rounded-lg p-2 ${tone}`}><Icon size={18} /></div> : null}
        <p className="text-xs font-medium uppercase text-slate-400">{label}</p>
        <div className="mt-1.5 flex items-end justify-between gap-3">
          <p className="text-2xl font-semibold text-slate-950">{value}</p>
          {tag ? <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tagClass}`}>{tag}</span> : null}
        </div>
      </Card>)}
    </ListKpiGrid> : null}
    {detalhesCobrancas ? <p className="text-xs text-slate-500">Indicadores e seleção desta página.</p> : null}
    {monitor ? <p className="text-xs text-slate-500">Indicadores desta página.</p> : null}

    <ListCollapsibleFilters defaultOpen={hasFilters || aba === 'gerar'} actions={<ClearFiltersLink href={`${basePath}?aba=${aba}`} show={hasFilters} />}>
      <ListFiltersForm key={returnQuery.toString()} action={basePath} className="grid-cols-1 md:grid-cols-2 xl:grid-cols-6">
        <input type="hidden" name="aba" value={aba} />
        <FlowScopeFilters carteiras={carteiras} condominios={condominios} carteiraId={filters.carteiraId} condominioId={filters.condominioId} />
        {monitor ? <ListFilterField label="Ordenar por" className="xl:col-span-2"><Select name="ordenar" defaultValue={ordenar}><option value="criacao_desc">Criação mais recente</option><option value="agenda_asc">Agenda: próximos disparos primeiro</option><option value="agenda_desc">Agenda: disparos mais distantes primeiro</option></Select></ListFilterField> : null}
        {detalhesCobrancas ? <><ListFilterField label="Vencimento de"><Input type="date" name="vencimento_de" defaultValue={filters.vencimentoDe ?? ''} /></ListFilterField>
        <ListFilterField label="Vencimento até"><Input type="date" name="vencimento_ate" defaultValue={filters.vencimentoAte ?? ''} /></ListFilterField></> : null}
        {aba !== 'maestro' ? <><ListFilterField label={monitor ? 'Criação de' : 'Inclusão de'}><Input type="date" name="inclusao_de" defaultValue={filters.inclusaoDe ?? ''} /></ListFilterField>
        <ListFilterField label={monitor ? 'Criação até' : 'Inclusão até'}><Input type="date" name="inclusao_ate" defaultValue={filters.inclusaoAte ?? ''} /></ListFilterField></> : null}
        {monitor ? <ListFilterField label="Status" className="xl:col-span-2"><Select name="status" defaultValue={status ?? ''}><option value="">Todos os status desta área</option>{(aba === 'historico' ? [['concluido', 'Concluído'], ['concluido_com_falhas', 'Concluído com falhas'], ['cancelado', 'Cancelado']] : [['pronto', 'Pronto para ativar'], ['em_execucao', 'Em execução'], ['pausado', 'Pausado']]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></ListFilterField> : null}
        <Button type="submit" className="w-full xl:col-span-2">Filtrar</Button>
      </ListFiltersForm>
    </ListCollapsibleFilters>

    <FlowWorkerProvider canal={canal} enabled={aba === 'flows' && data.flows.length > 0}><FlowCobrancaAbas
      canal={canal}
      aba={aba}
      maestro={aba === 'maestro' && canal === 'email' ? <MaestroMontagens mostrarVazio carteiraId={filters.carteiraId} condominioIds={filters.condominioId ? [filters.condominioId] : undefined} /> : null}
      painel={painelRows}
      saneamento={data.saneamento}
      saneamentoTotal={data.saneamento.length}
      returnQuery={new URLSearchParams({ ...Object.fromEntries(returnQuery), pagina: String(page) }).toString()}
      disponibilidade={disponibilidadeRows}
      reguas={data.reguas as any[]}
      flows={data.flows as any[]}
      initialStep={safeStep(params.step)}
      initialSelectedIds={selecionadas}
    /></FlowWorkerProvider>
    {monitor || detalhesCobrancas ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-sm text-slate-600">Página {page} · {monitor ? 'Até ' + FLOWS_PAGE_SIZE + ' flows por página' : 'Até ' + COBRANCAS_FLOW_PAGE_SIZE + ' cobranças novas e ' + COBRANCAS_FLOW_PAGE_SIZE + ' ativas consultadas por página'}</p>
      <div className="flex gap-2">{page > 1 ? <ButtonLink href={pageHref(page - 1)} prefetch={false} variant="secondary">Anterior</ButtonLink> : null}{hasNext ? <ButtonLink href={pageHref(page + 1)} prefetch={false} variant="secondary">Próxima</ButtonLink> : null}</div>
    </div> : null}
  </ListPage>
}
