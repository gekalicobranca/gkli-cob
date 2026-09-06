import { sortCondominios } from '@/features/condominios/sort'
import Link from 'next/link'
import { ArrowUpRight, Building2, Download, Edit3, FileText, Filter, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { KpiCard } from '@/components/ui/kpi-card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
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
  ListPanel,
  ListPanelHeader,
  ListPagination,
  ListRow,
  ListRows,
  ListSearchField,
  ListTitle,
  ListTitleBar,
} from '@/components/layout/list-page'
import { formatCurrency } from '@/utils/formatters/currency'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCarteirasForSelect } from '@/features/cadastros/queries'
import { ClassificacaoOperacionalBadge } from '@/features/condominios/components/classificacao-operacional'
import {
  listAdministradorasCondominios,
  listCondominios,
  normalizeCondominioFilters,
} from '@/features/condominios/queries'

type CondominiosPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const PAGE_SIZE = 100

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function getPageParam(value: string | string[] | undefined) {
  const page = Number(getParam(value) ?? 1)
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

function condominiosHref(params: Record<string, string | undefined>, page: number) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value)
  if (page > 1) query.set('page', String(page))
  const qs = query.toString()
  return qs ? `/app/condominios?${qs}` : '/app/condominios'
}

export default async function CondominiosPage({ searchParams }: CondominiosPageProps) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const page = getPageParam(params?.page)
  const statusParam = getParam(params?.status)

  const filters = normalizeCondominioFilters({
    search: getParam(params?.q),
    carteiraId: getParam(params?.carteira_id),
    administradora: getParam(params?.administradora),
    status: statusParam === undefined ? 'ativo' : statusParam,
  })

  const [rowsBase, carteiras, administradoras] = await Promise.all([
    listCondominios(scope, filters),
    listCarteirasForSelect(scope),
    listAdministradorasCondominios(scope),
  ])

  const ordenar = getParam(params?.ordenar) ?? 'nome'
  const filteredRows = sortCondominios(rowsBase, ordenar)
  const rows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const filtrosAtivos =
    Boolean(filters.search || filters.carteiraId || filters.administradora || (filters.status && filters.status !== 'ativo')) ||
    ordenar !== 'nome'
  const exportParams = new URLSearchParams()

  if (filters.carteiraId) exportParams.set('carteira_id', filters.carteiraId)

  const exportCondominiosHref = `/api/condominios/exportacoes/condominios${exportParams.toString() ? `?${exportParams.toString()}` : ''}`
  const reportParams = new URLSearchParams({ status: filters.status ?? '', ordenar })
  if (filters.search) reportParams.set('q', filters.search)
  if (filters.carteiraId) reportParams.set('carteira_id', filters.carteiraId)
  if (filters.administradora) reportParams.set('administradora', filters.administradora)
  const reportHref = '/api/condominios/relatorio-executivo?' + reportParams.toString()
  const ativos = filteredRows.filter((row: any) => row.status === 'ativo').length
  const mediaRegua = filteredRows.length
    ? Math.round(filteredRows.reduce((sum: number, row: any) => sum + Number(row.inicio_cobranca_dias ?? 0), 0) / filteredRows.length)
    : 0
  const ticketMedio = filteredRows.length
    ? filteredRows.reduce((sum: number, row: any) => sum + Number(row.valor_cota_condominial ?? 0), 0) / filteredRows.length
    : 0
  const paginationParams = {
    q: filters.search,
    carteira_id: filters.carteiraId,
    administradora: filters.administradora,
    status: filters.status,
    ordenar,
  }

  return (
    <ListPage>
      <PageHeader
        eyebrow="Base Cadastral"
        title="Condomínios"
        description="Base de condomínios, filtros operacionais, regras de início de cobrança e vínculo com carteiras."
        actions={
          <>
            <ButtonLink href={reportHref} variant="secondary" target="_blank">
              <FileText size={16} />
              Relatório executivo
            </ButtonLink>
            <ButtonLink href={exportCondominiosHref} variant="secondary">
              <Download size={16} />
              Exportar
            </ButtonLink>
            <ButtonLink href="/app/condominios/novo">
              <Plus size={16} />
              Novo condomínio
            </ButtonLink>
          </>
        }
      />

      <ListKpiGrid className="md:grid-cols-3 xl:grid-cols-3">
        <KpiCard label="Ativos" value={ativos} icon={<Building2 size={18} />} />
        <KpiCard label="Régua média" value={`D+${mediaRegua}`} />
        <KpiCard label="Cota média" value={formatCurrency(ticketMedio)} />
      </ListKpiGrid>

      <ListPanel>
        <ListPanelHeader>
          <ListTitleBar>
            <ListTitle title="Filtros e resultados" />
            <ClearFiltersLink href="/app/condominios" show={filtrosAtivos} />
          </ListTitleBar>

          <ListFiltersForm className="grid-cols-1 md:grid-cols-2 xl:grid-cols-12">
            <ListSearchField
              placeholder="Nome, nome operacional, CNPJ ou administradora"
              defaultValue={filters.search ?? ''}
              className="xl:col-span-4"
            />
            <ListFilterField label="Carteira" className="xl:col-span-2">
              <Select name="carteira_id" defaultValue={filters.carteiraId ?? ''}>
                <option value="">Todas</option>
                {carteiras.map((carteira: any) => (
                  <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>
                ))}
              </Select>
            </ListFilterField>
            <ListFilterField label="Administradora" className="xl:col-span-3">
              <SearchableSelect
                name="administradora"
                options={administradoras.map((administradora) => ({ value: administradora, label: administradora }))}
                selectedValue={filters.administradora ?? ''}
                placeholder="Digite parte da administradora"
              />
            </ListFilterField>
            <ListFilterField label="Status" className="xl:col-span-1">
              <Select name="status" defaultValue={filters.status ?? ''}>
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="suspenso">Suspenso</option>
              </Select>
            </ListFilterField>
            <ListFilterField label="Ordenar por" className="xl:col-span-2">
              <Select name="ordenar" defaultValue={ordenar}>
                <option value="nome">Nome</option>
                <option value="administradora">Administradora</option>
                <option value="status">Status</option>
                <option value="carteira">Carteira</option>
                <option value="regua_asc">Régua menor</option>
                <option value="regua_desc">Régua maior</option>
                <option value="cota_desc">Maior cota</option>
                <option value="cota_asc">Menor cota</option>
              </Select>
            </ListFilterField>
            <Button type="submit" className="w-full xl:col-span-1">
              <Filter size={16} />
              Filtrar
            </Button>
          </ListFiltersForm>
        </ListPanelHeader>

        {rows.length === 0 ? (
          <ListEmptyState
            title="Nenhum condomínio encontrado"
            description="Ajuste os filtros ou cadastre/importe condomínios para compor a base cadastral."
          />
        ) : (
          <ListRows>
            {rows.map((row: any) => (
              <ListRow
                key={row.id}
                className="xl:grid-cols-[minmax(320px,1.5fr)_110px_140px_130px_160px_170px]"
              >
                <Link href={`/app/condominios/${row.id}`} className="group min-w-0">
                  <ListItemTitle className="group-hover:text-[var(--gkli-primary)]">
                    {row.nome_operacional || row.nome || 'Nome não informado'}
                  </ListItemTitle>
                  <ListItemMeta>
                    {row.nome_operacional && row.nome_operacional !== row.nome ? `Oficial: ${row.nome} · ` : ''}
                    {row.administradora ?? '-'} · CNPJ {row.cnpj ?? '-'} · {row.carteiras?.nome ?? '-'}
                  </ListItemMeta>
                </Link>

                <ClassificacaoOperacionalBadge value={row.classificacao_operacional} />
                <StatusBadge status={row.status} />

                <ListMetric label="Régua" value={`D+${row.inicio_cobranca_dias}`} />
                <ListMetric
                  label="Cota"
                  value={formatCurrency(Number(row.valor_cota_condominial ?? 0))}
                  valueClassName="font-semibold text-slate-950"
                />

                <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                  <ButtonLink href={`/app/condominios/${row.id}`} variant="secondary" size="sm">
                    <ArrowUpRight size={15} />
                    Abrir
                  </ButtonLink>
                  <ButtonLink href={`/app/condominios/${row.id}#cadastro`} size="sm">
                    <Edit3 size={15} />
                    Editar
                  </ButtonLink>
                </div>
              </ListRow>
            ))}
          </ListRows>
        )}
        <ListPagination
          page={page}
          pageSize={PAGE_SIZE}
          total={filteredRows.length}
          previousHref={page > 1 ? condominiosHref(paginationParams, page - 1) : undefined}
          nextHref={page * PAGE_SIZE < filteredRows.length ? condominiosHref(paginationParams, page + 1) : undefined}
        />
      </ListPanel>
    </ListPage>
  )
}
