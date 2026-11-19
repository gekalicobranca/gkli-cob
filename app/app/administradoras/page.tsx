import Link from 'next/link'
import { ArrowUpRight, Building2, Download, Filter, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { KpiCard } from '@/components/ui/kpi-card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/data/status-badge'
import {
  ClearFiltersLink,
  ListEmptyState,
  ListFilterField,
  ListFiltersForm,
  ListItemMeta,
  ListItemTitle,
  ListKpiGrid,
  ListMetric,
  ListPage,
  ListPagination,
  ListPanel,
  ListPanelHeader,
  ListRow,
  ListRows,
  ListSearchField,
  ListTitle,
  ListTitleBar,
} from '@/components/layout/list-page'
import { listAdministradorasPage, normalizeAdmFilters, type AdministradoraOrder } from '@/features/administradoras/queries'

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> }

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

const PAGE_SIZE = 50
const ORDER_OPTIONS: AdministradoraOrder[] = ['nome', 'status', 'acesso_acordo', 'contato']

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function pageHref(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params)
  next.set('page', String(page))
  return `/app/administradoras?${next.toString()}`
}

export default async function AdministradorasPage({ searchParams }: Props) {
  const params = await searchParams
  const statusParam = getParam(params?.status)
  const filters = normalizeAdmFilters({
    search: getParam(params?.q),
    status: statusParam === undefined ? 'ativo' : statusParam,
    acessoAcordo: getParam(params?.acesso_acordo),
  })
  const requestedOrder = getParam(params?.ordenar) ?? 'nome'
  const ordenar = ORDER_OPTIONS.includes(requestedOrder as AdministradoraOrder)
    ? requestedOrder as AdministradoraOrder
    : 'nome'
  const page = positiveInteger(getParam(params?.page), 1)
  let pageData: Awaited<ReturnType<typeof listAdministradorasPage>> | null = null
  let loadError: string | null = null
  try {
    pageData = await listAdministradorasPage(filters, { page, pageSize: PAGE_SIZE, order: ordenar })
  } catch (error) {
    console.error('Falha ao carregar a listagem de administradoras.', error)
    loadError = 'O cadastro não foi carregado. Tente novamente; se o erro persistir, acione o suporte.'
  }
  const rows = pageData?.rows ?? []
  const ativas = pageData?.activeTotal ?? 0
  const filtrosAtivos = Boolean(
    filters.search ||
    (filters.status && filters.status !== 'ativo') ||
    getParam(params?.acesso_acordo) ||
    ordenar !== 'nome',
  )
  const exportParams = new URLSearchParams()
  if (filters.search) exportParams.set('q', filters.search)
  if (filters.status) exportParams.set('status', filters.status)
  if (filters.acessoAcordo) exportParams.set('acesso_acordo', filters.acessoAcordo)
  if (ordenar) exportParams.set('ordenar', ordenar)
  const exportAdministradorasHref = `/api/administradoras/exportacoes/administradoras${exportParams.toString() ? `?${exportParams.toString()}` : ''}`

  return (
    <ListPage>
      <PageHeader
        eyebrow="Base Cadastral"
        title="Cadastro de administradoras"
        description="Controle global das administradoras, seus contatos e a operação externa que destrava planilhas, boletos e registros de acordo."
        actions={
          <>
            <ButtonLink href={exportAdministradorasHref} variant="secondary">
              <Download size={16} />
              Exportar
            </ButtonLink>
            <ButtonLink href="/app/administradoras/nova"><Plus size={16} />Nova administradora</ButtonLink>
          </>
        }
      />

      <ListKpiGrid className="md:grid-cols-3 xl:grid-cols-3">
        <KpiCard label="Total filtrado" value={pageData?.total ?? '—'} />
        <KpiCard label="Ativas" value={ativas} />
        <KpiCard label="Hub externo" value="ADM" />
      </ListKpiGrid>

      <ListPanel>
        <ListPanelHeader>
          <ListTitleBar>
            <ListTitle
              title="Base de administradoras"
              description="Busque por nome, CNPJ ou e-mail. Este cadastro é global e não depende de carteira."
            />
            <ClearFiltersLink href="/app/administradoras" show={filtrosAtivos} />
          </ListTitleBar>

          <ListFiltersForm className="grid-cols-1 md:grid-cols-2 xl:grid-cols-12">
            <ListSearchField defaultValue={filters.search ?? ''} placeholder="Nome, CNPJ ou e-mail" className="xl:col-span-4" />
            <ListFilterField label="Status" className="xl:col-span-2">
              <Select name="status" defaultValue={filters.status ?? ''}>
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </Select>
            </ListFilterField>
            <ListFilterField label="Acesso acordos" className="xl:col-span-2">
              <Select name="acesso_acordo" defaultValue={getParam(params?.acesso_acordo) ?? ''}>
                <option value="">Todos</option>
                <option value="sim">Liberado</option>
                <option value="nao">Sem acesso</option>
              </Select>
            </ListFilterField>
            <ListFilterField label="Ordenar por" className="xl:col-span-3">
              <Select name="ordenar" defaultValue={ordenar}>
                <option value="nome">Nome</option>
                <option value="status">Status</option>
                <option value="acesso_acordo">Acesso acordos</option>
                <option value="contato">Contato</option>
              </Select>
            </ListFilterField>
            <Button type="submit" className="w-full xl:col-span-1">
              <Filter size={16} />Filtrar
            </Button>
          </ListFiltersForm>
        </ListPanelHeader>

        {loadError ? (
          <ListEmptyState title="Não foi possível carregar as administradoras" description={loadError} />
        ) : rows.length === 0 ? (
          <ListEmptyState
            title="Nenhuma administradora encontrada"
            description="Cadastre a primeira administradora para começar a controlar contatos, planilhas e boletos."
          />
        ) : (
          <ListRows>
            {rows.map((row) => (
              <ListRow
                key={row.id}
                className="xl:grid-cols-[minmax(260px,1.4fr)_150px_minmax(180px,.8fr)_minmax(220px,1fr)_150px]"
              >
                <Link href={`/app/administradoras/${row.id}`} className="group min-w-0">
                  <ListItemTitle className="group-hover:text-[var(--gkli-primary)]">
                    <Building2 size={16} className="mr-2 inline text-slate-400" />
                    {row.nome_operacional || row.nome}
                  </ListItemTitle>
                  <ListItemMeta>
                    Razão: {row.nome} · CNPJ {row.cnpj ?? '-'} · Resp. {row.responsavel_interno ?? '-'}
                  </ListItemMeta>
                </Link>
                <StatusBadge status={row.status ?? 'ativo'} />
                <ListMetric
                  label="Acordos"
                  value={row.acesso_gerar_acordo ? 'Acesso liberado' : 'Sem acesso'}
                  valueClassName={row.acesso_gerar_acordo ? 'text-emerald-700' : 'text-slate-500'}
                />
                <ListMetric label="Contato geral" value={row.email ?? row.telefone ?? '-'} valueClassName="truncate" />
                <div className="flex justify-start xl:justify-end">
                  <ButtonLink href={`/app/administradoras/${row.id}`} size="sm" variant="secondary">
                    <ArrowUpRight size={15} />
                    Abrir
                  </ButtonLink>
                </div>
              </ListRow>
            ))}
          </ListRows>
        )}
        {pageData ? (
          <ListPagination
            page={pageData.page}
            pageSize={pageData.pageSize}
            total={pageData.total}
            previousHref={pageData.page > 1 ? pageHref(new URLSearchParams({
              ...(filters.search ? { q: filters.search } : {}),
              ...(filters.status ? { status: filters.status } : {}),
              ...(filters.acessoAcordo ? { acesso_acordo: filters.acessoAcordo } : {}),
              ...(ordenar ? { ordenar } : {}),
            }), pageData.page - 1) : undefined}
            nextHref={pageData.page * pageData.pageSize < pageData.total ? pageHref(new URLSearchParams({
              ...(filters.search ? { q: filters.search } : {}),
              ...(filters.status ? { status: filters.status } : {}),
              ...(filters.acessoAcordo ? { acesso_acordo: filters.acessoAcordo } : {}),
              ...(ordenar ? { ordenar } : {}),
            }), pageData.page + 1) : undefined}
          />
        ) : null}
      </ListPanel>
    </ListPage>
  )
}
