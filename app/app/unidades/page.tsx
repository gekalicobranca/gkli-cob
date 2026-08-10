import Link from 'next/link'
import { ArrowUpRight, ChevronDown, Download, Edit3, Filter, Home, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { CondominioSearchSelect } from '@/components/gestao/condominio-search-select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { StatusBadge } from '@/components/data/status-badge'
import {
  ClearFiltersLink,
  ListEmptyState,
  ListFilterField,
  ListFiltersForm,
  ListKpiGrid,
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
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCarteirasForSelect, listCondominiosForSelect } from '@/features/cadastros/queries'
import { updateUnidadesStatusEmLote } from '@/features/unidades/actions'
import { listUnidadesPage, normalizeUnidadeFilters, summarizeUnidades } from '@/features/unidades/queries'
import { UnidadesBulkControls } from './unidades-bulk-controls'

type UnidadesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const PAGE_SIZE = 100
const EMPTY_RESUMO = {
  total: 0,
  ativas: 0,
  semTelefone: 0,
  semEmail: 0,
}

function emptyPageData(page: number) {
  return {
    rows: [],
    total: 0,
    page,
    pageSize: PAGE_SIZE,
    error: null as string | null,
  }
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function getPageParam(value: string | string[] | undefined) {
  const page = Number(getParam(value) ?? 1)
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

function unidadesHref(params: Record<string, string | undefined>, page: number) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value)
  }
  if (page > 1) query.set('page', String(page))
  const qs = query.toString()
  return qs ? `/app/unidades?${qs}` : '/app/unidades'
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function sortUnidades(rows: any[], ordenar: string) {
  const field = ordenar || 'condominio'
  return [...rows].sort((a, b) => {
    const getValue = (row: any) => {
      if (field === 'unidade') return normalizeText(row.identificacao)
      if (field === 'responsavel') return normalizeText(row.responsavel_nome)
      if (field === 'status') return normalizeText(row.status)
      if (field === 'carteira') return normalizeText(row.carteiras?.nome)
      return normalizeText(row.condominios?.nome)
    }
    return getValue(a).localeCompare(getValue(b), 'pt-BR', { numeric: true })
  })
}

function groupUnidades(rows: any[]) {
  const groups = new Map<string, { id: string; nome: string; unidades: any[] }>()
  for (const row of rows) {
    const id = row.condominios?.id ?? row.condominio_id ?? 'sem-condominio'
    if (!groups.has(id)) groups.set(id, { id, nome: row.condominios?.nome ?? 'Condomínio não informado', unidades: [] })
    groups.get(id)!.unidades.push(row)
  }
  return Array.from(groups.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export default async function UnidadesPage({ searchParams }: UnidadesPageProps) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const page = getPageParam(params?.page)
  const statusParam = getParam(params?.status)

  const filters = normalizeUnidadeFilters({
    search: getParam(params?.q),
    carteiraId: getParam(params?.carteira_id),
    condominioId: getParam(params?.condominio_id),
    status: statusParam === undefined ? 'ativa' : statusParam,
    contato: getParam(params?.contato),
  })

  const ordenar = getParam(params?.ordenar) ?? 'condominio'
  const [pageData, resumo, carteiras, condominios] = await Promise.all([
    listUnidadesPage(scope, filters, { page, pageSize: PAGE_SIZE, orderBy: ordenar }).catch((error) => {
      console.error('Erro ao carregar lista de unidades:', error)
      return { ...emptyPageData(page), error: 'Nao foi possivel carregar a lista de unidades agora.' }
    }),
    summarizeUnidades(scope, filters).catch((error) => {
      console.error('Erro ao resumir unidades na lista:', error)
      return EMPTY_RESUMO
    }),
    listCarteirasForSelect(scope).catch((error) => {
      console.error('Erro ao carregar carteiras no filtro de unidades:', error)
      return []
    }),
    listCondominiosForSelect(scope).catch((error) => {
      console.error('Erro ao carregar condominios no filtro de unidades:', error)
      return []
    }),
  ])
  const rows = sortUnidades(pageData.rows, ordenar)
  const groups = groupUnidades(rows)

  const filtrosAtivos =
    Boolean(filters.search || filters.carteiraId || filters.condominioId || filters.contato || (filters.status && filters.status !== 'ativa')) ||
    ordenar !== 'condominio'
  const exportParams = new URLSearchParams()

  if (filters.search) exportParams.set('q', filters.search)
  if (filters.carteiraId) exportParams.set('carteira_id', filters.carteiraId)
  if (filters.condominioId) exportParams.set('condominio_id', filters.condominioId)
  if (filters.status) exportParams.set('status', filters.status)
  if (filters.contato) exportParams.set('contato', filters.contato)
  if (ordenar) exportParams.set('ordenar', ordenar)

  const exportUnidadesHref = `/api/unidades/exportacoes/unidades${exportParams.toString() ? `?${exportParams.toString()}` : ''}`
  const paginationParams = {
    q: filters.search,
    carteira_id: filters.carteiraId,
    condominio_id: filters.condominioId,
    status: filters.status,
    contato: filters.contato,
    ordenar,
  }
  const previousHref = page > 1 ? unidadesHref(paginationParams, page - 1) : undefined
  const nextHref = page * PAGE_SIZE < pageData.total ? unidadesHref(paginationParams, page + 1) : undefined

  return (
    <ListPage>
      <PageHeader
        eyebrow="Base Cadastral"
        title="Unidades"
        description="Unidades, responsáveis, contatos e filtros operacionais para cobrança."
        actions={
          <>
            <ButtonLink href={exportUnidadesHref} variant="secondary">
              <Download size={16} />
              Exportar
            </ButtonLink>
            <ButtonLink href="/app/unidades/nova">
              <Plus size={16} />
              Nova unidade
            </ButtonLink>
          </>
        }
      />

      <ListKpiGrid className="md:grid-cols-3 xl:grid-cols-3">
        <Card className="relative overflow-hidden p-3">
          <div className="absolute right-4 top-3 rounded-lg bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
            <Home size={18} />
          </div>
          <p className="text-xs font-medium uppercase text-slate-400">Ativas</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-950">{resumo.ativas}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase text-slate-400">Sem telefone</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-950">{resumo.semTelefone}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase text-slate-400">Sem e-mail</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-950">{resumo.semEmail}</p>
        </Card>
      </ListKpiGrid>

      <ListPanel>
        <ListPanelHeader>
          <ListTitleBar>
            <ListTitle title="Base de unidades" />
            <ClearFiltersLink href="/app/unidades" show={filtrosAtivos} />
          </ListTitleBar>

          <ListFiltersForm className="grid-cols-1 md:grid-cols-2 xl:grid-cols-12">
            <ListSearchField
              placeholder="Unidade, condomínio, bloco, responsável, CPF/CNPJ, telefone ou e-mail"
              defaultValue={filters.search ?? ''}
              className="xl:col-span-4"
            />
            <ListFilterField label="Carteira" className="xl:col-span-2">
              <SearchableSelect
                name="carteira_id"
                options={carteiras.map((carteira: any) => ({ value: carteira.id, label: carteira.nome }))}
                selectedValue={filters.carteiraId ?? ''}
                placeholder="Digite parte da carteira"
              />
            </ListFilterField>
            <ListFilterField label="Condomínio" className="xl:col-span-4">
              <CondominioSearchSelect
                name="condominio_id"
                options={condominios.map((condominio: any) => ({
                  id: condominio.id,
                  nome: condominio.nome,
                  administradora: condominio.administradora ?? null,
                }))}
                selectedId={filters.condominioId ?? ''}
                defaultToFirst={false}
                inputClassName=""
              />
            </ListFilterField>
            <ListFilterField label="Status" className="xl:col-span-2">
              <Select name="status" defaultValue={filters.status ?? ''}>
                <option value="">Todos</option>
                <option value="ativa">Ativa</option>
                <option value="inativa">Inativa</option>
                <option value="suspensa">Suspensa</option>
              </Select>
            </ListFilterField>
            <ListFilterField label="Contato" className="xl:col-span-2">
              <Select name="contato" defaultValue={filters.contato ?? ''}>
                <option value="">Todos</option>
                <option value="sem_telefone">Sem telefone</option>
                <option value="sem_email">Sem e-mail</option>
                <option value="incompleto">Cadastro incompleto</option>
              </Select>
            </ListFilterField>
            <ListFilterField label="Ordenar por" className="xl:col-span-3">
              <Select name="ordenar" defaultValue={ordenar}>
                <option value="condominio">Condomínio</option>
                <option value="unidade">Unidade</option>
                <option value="responsavel">Responsável</option>
                <option value="status">Status</option>
                <option value="carteira">Carteira</option>
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
            title="Nenhuma unidade encontrada"
            description="Ajuste os filtros ou cadastre/importe unidades para iniciar a operação."
          />
        ) : (
          <form action={updateUnidadesStatusEmLote}>
            <UnidadesBulkControls />
            <ListRows>
              {groups.map((group) => (
                <details key={group.id} open className="group/condominio bg-white">
                  <summary className="flex cursor-pointer list-none items-center gap-3 bg-slate-50/70 px-4 py-2.5 transition hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
                    <ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open/condominio:rotate-180" />
                    <div><p className="text-sm font-semibold text-slate-950">{group.nome}</p><p className="mt-0.5 text-xs text-slate-500">{group.unidades.length} unidade(s) nesta página</p></div>
                  </summary>
                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {group.unidades.map((row: any) => (
                <ListRow
                  key={row.id}
                  className="xl:grid-cols-[40px_minmax(300px,1.35fr)_120px_170px_220px_170px]"
                >
                  <label className="flex items-center xl:justify-center">
                    <input
                      type="checkbox"
                      name="unidade_ids"
                      value={row.id}
                      aria-label={`Selecionar unidade ${row.identificacao || ''}`}
                      className="size-4 rounded border-slate-300"
                    />
                  </label>

                  <Link href={`/app/unidades/${row.id}`} className="group min-w-0">
                    <p className="truncate text-sm font-medium text-slate-950 group-hover:text-[var(--gkli-primary)]">
                      Unidade {row.identificacao || '-'} {row.bloco ? `· Bloco ${row.bloco}` : ''}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {row.condominios?.nome ?? '-'} · {row.responsavel_nome ?? 'Responsável não informado'} ·{' '}
                      {row.carteiras?.nome ?? '-'}
                    </p>
                  </Link>

                  <StatusBadge status={row.status} />

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Telefone</p>
                    <p className="mt-1 text-sm text-slate-700">{row.telefone ?? '-'}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">E-mail</p>
                    <p className="mt-1 truncate text-sm text-slate-700">{row.email ?? '-'}</p>
                  </div>

                  <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                    <ButtonLink href={`/app/unidades/${row.id}`} variant="secondary" size="sm">
                      <ArrowUpRight size={15} />
                      Abrir
                    </ButtonLink>
                    <ButtonLink href={`/app/unidades/${row.id}#cadastro`} size="sm">
                      <Edit3 size={15} />
                      Editar
                    </ButtonLink>
                  </div>
                </ListRow>
                  ))}
                  </div>
                </details>
              ))}
            </ListRows>
          </form>
        )}
        <ListPagination
          page={page}
          pageSize={PAGE_SIZE}
          total={pageData.total}
          previousHref={previousHref}
          nextHref={nextHref}
        />
      </ListPanel>
    </ListPage>
  )
}
