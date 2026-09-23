import { FileText, Layers, ListChecks, Network, WalletCards, type LucideIcon } from 'lucide-react'
import { CondominioSearchSelect } from '@/components/gestao/condominio-search-select'
import { FlowCobrancaNav } from './flow-cobranca-nav'
import { FlowCobrancaAbas } from '@/components/flows/cobranca/flow-cobranca-abas'
import { MaestroMontagens } from '@/components/flows/cobranca/maestro-montagens'
import { ClearFiltersLink, ListCollapsibleFilters, ListFilterField, ListFiltersForm, ListKpiGrid, ListPage } from '@/components/layout/list-page'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Select } from '@/components/ui/select'
import { listCarteiras } from '@/features/carteiras/queries'
import { getFlowCobrancaPageData, getFlowCobrancaMonitorData, listFlowCobrancaCondominios, FLOWS_PAGE_SIZE, hasFlowCobrancaFilters, normalizeFlowCobrancaFilters } from '@/features/flows/cobranca/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { formatCurrency } from '@/utils/formatters/currency'
import { flowCobrancaPath, flowCobrancaAba, flowCobrancaPagina, flowCobrancaOrdem, type CanalFlowCobranca } from '@/features/flows/cobranca/rotas'

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
    inclusaoDe: params.inclusao_de,
    inclusaoAte: params.inclusao_ate,
  })
  const hasFilters = hasFlowCobrancaFilters({ ...filters, canal: undefined }) || Boolean(monitor && (params.status || ordenar !== 'criacao_desc'))
  const dataPromise = monitor
    ? getFlowCobrancaMonitorData(scope, filters, { page, historico: aba === 'historico', status: params.status, ordenar })
    : aba === 'saneamento' || (aba === 'gerar' && filters.condominioId)
      ? getFlowCobrancaPageData(scope, filters, { somenteSaneamento: aba === 'saneamento' })
      : Promise.resolve({ painel: [], disponibilidade: [], saneamento: [], reguas: [], flows: [], hasNext: false })
  const [data, carteiras, condominios] = await Promise.all([
    dataPromise,
    listCarteiras(scope),
    listFlowCobrancaCondominios(scope, filters.carteiraId),
  ])
  const painelRows = (data.painel ?? []) as any[]
  const disponibilidadeRows = (data.disponibilidade ?? []) as any[]
  const selecionadas = selectedIds(params.selecionadas)
  const valorNovo = painelRows.reduce((sum: number, row: any) => sum + Number(row.valor_atualizado ?? row.valor_original ?? 0), 0)
  const unidades = new Set(painelRows.map((row: any) => row.unidade_id).filter(Boolean)).size
  const returnQuery = new URLSearchParams({ aba })
  if (monitor) returnQuery.set('ordenar', ordenar)
  if (monitor && params.status) returnQuery.set('status', params.status)
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

  const saneamentoPageSize = 50
  const hasNext = monitor ? data.hasNext : aba === 'saneamento' && data.saneamento.length > page * saneamentoPageSize
  function pageHref(nextPage: number) {
    const query = new URLSearchParams(returnQuery)
    query.set('pagina', String(nextPage))
    return `${basePath}?${query}`
  }

  return <ListPage>
    <PageHeader
      eyebrow="Flows"
      title={`Flows de cobrança · ${canalLabel}`}
      description={`Crie e acompanhe os flows de ${canalLabel} por condomínio. Corrija os cadastros pendentes em Saneamento.`}
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

    {monitor || (aba === 'gerar' && filters.condominioId) ? <ListKpiGrid>
      {kpis.map(({ label, value, icon: Icon, tag, tagClass, tone }) => <Card key={label} className="relative overflow-hidden p-3">
        {Icon ? <div className={`absolute right-4 top-3 rounded-lg p-2 ${tone}`}><Icon size={18} /></div> : null}
        <p className="text-xs font-medium uppercase text-slate-400">{label}</p>
        <div className="mt-1.5 flex items-end justify-between gap-3">
          <p className="text-2xl font-semibold text-slate-950">{value}</p>
          {tag ? <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tagClass}`}>{tag}</span> : null}
        </div>
      </Card>)}
    </ListKpiGrid> : null}
    {monitor ? <p className="text-xs text-slate-500">Indicadores dos flows desta página. Use os filtros para localizar um condomínio ou status.</p> : null}

    <ListCollapsibleFilters defaultOpen={hasFilters || aba === 'gerar'} actions={<ClearFiltersLink href={`${basePath}?aba=${aba}`} show={hasFilters} />}>
      <ListFiltersForm action={basePath} className="grid-cols-1 md:grid-cols-2 xl:grid-cols-6">
        <input type="hidden" name="aba" value={aba} />
        <ListFilterField label="Carteira" className="xl:col-span-2"><Select name="carteira" defaultValue={filters.carteiraId ?? ''}><option value="">Todas</option>{carteiras.map((carteira: any) => <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>)}</Select></ListFilterField>
        <ListFilterField label="Condomínio" className="xl:col-span-2"><CondominioSearchSelect name="condominio" options={condominios.map((row: any) => ({ id: row.id, nome: row.nome_operacional || row.nome || 'Condomínio não informado', administradora: null })) as any[]} selectedId={filters.condominioId ?? ''} defaultToFirst={false} inputClassName="" /></ListFilterField>
        {monitor ? <ListFilterField label="Ordenar por" className="xl:col-span-2"><Select name="ordenar" defaultValue={ordenar}><option value="criacao_desc">Criação mais recente</option><option value="agenda_asc">Agenda: próximos disparos primeiro</option><option value="agenda_desc">Agenda: disparos mais distantes primeiro</option></Select></ListFilterField> : null}
        {detalhesCobrancas ? <><ListFilterField label="Vencimento de"><Input type="date" name="vencimento_de" defaultValue={filters.vencimentoDe ?? ''} /></ListFilterField>
        <ListFilterField label="Vencimento até"><Input type="date" name="vencimento_ate" defaultValue={filters.vencimentoAte ?? ''} /></ListFilterField></> : null}
        {aba !== 'maestro' ? <><ListFilterField label={monitor ? 'Criação de' : 'Inclusão de'}><Input type="date" name="inclusao_de" defaultValue={filters.inclusaoDe ?? ''} /></ListFilterField>
        <ListFilterField label={monitor ? 'Criação até' : 'Inclusão até'}><Input type="date" name="inclusao_ate" defaultValue={filters.inclusaoAte ?? ''} /></ListFilterField></> : null}
        {monitor ? <ListFilterField label="Status" className="xl:col-span-2"><Select name="status" defaultValue={params.status ?? ''}><option value="">Todos os status desta área</option>{(aba === 'historico' ? [['concluido', 'Concluído'], ['concluido_com_falhas', 'Concluído com falhas'], ['cancelado', 'Cancelado']] : [['pronto', 'Pronto para ativar'], ['em_execucao', 'Em execução'], ['pausado', 'Pausado']]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></ListFilterField> : null}
        <Button type="submit" className="w-full xl:col-span-2">Filtrar</Button>
      </ListFiltersForm>
    </ListCollapsibleFilters>

    <FlowCobrancaAbas
      canal={canal}
      aba={aba}
      condominioSelecionado={Boolean(filters.condominioId)}
      maestro={aba === 'maestro' && canal === 'email' ? <MaestroMontagens mostrarVazio carteiraId={filters.carteiraId} condominioIds={filters.condominioId ? [filters.condominioId] : undefined} /> : null}
      painel={painelRows}
      saneamento={data.saneamento.slice((page - 1) * saneamentoPageSize, page * saneamentoPageSize)}
      saneamentoTotal={data.saneamento.length}
      returnQuery={new URLSearchParams({ ...Object.fromEntries(returnQuery), pagina: String(page) }).toString()}
      disponibilidade={disponibilidadeRows}
      reguas={data.reguas as any[]}
      flows={data.flows as any[]}
      initialStep={safeStep(params.step)}
      initialSelectedIds={selecionadas}
    />
    {monitor || aba === 'saneamento' ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-sm text-slate-600">Página {page} · {monitor ? 'Até ' + FLOWS_PAGE_SIZE + ' flows por página' : data.saneamento.length + ' cobrança(s) para saneamento'}</p>
      <div className="flex gap-2">{page > 1 ? <ButtonLink href={pageHref(page - 1)} prefetch={false} variant="secondary">Anterior</ButtonLink> : null}{hasNext ? <ButtonLink href={pageHref(page + 1)} prefetch={false} variant="secondary">Próxima</ButtonLink> : null}</div>
    </div> : null}
  </ListPage>
}
