import Link from 'next/link'
import { ChevronDown, Edit3, Plus, UsersRound } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { KpiCard } from '@/components/ui/kpi-card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { CondominioSearchSelect } from '@/components/gestao/condominio-search-select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Badge } from '@/components/ui/badge'
import {
  ClearFiltersLink,
  ListEmptyState,
  ListFilterField,
  ListFiltersForm,
  ListItemMeta,
  ListItemTitle,
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
import {
  listResponsaveisUnidadesPage,
  normalizeResponsavelUnidadeFilters,
  summarizeResponsaveisUnidades,
} from '@/features/responsaveis-unidades/queries'

type ResponsaveisPageProps = {
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

function responsaveisHref(params: Record<string, string | undefined>, page: number) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value)
  }
  if (page > 1) query.set('page', String(page))
  const qs = query.toString()
  return qs ? `/app/responsaveis?${qs}` : '/app/responsaveis'
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function sortResponsaveis(rows: any[], ordenar: string) {
  const field = ordenar || 'condominio'
  return [...rows].sort((a, b) => {
    const getValue = (row: any) => {
      if (field === 'unidade') return normalizeText(row.unidade)
      if (field === 'responsavel') return normalizeText(row.responsavel_nome)
      if (field === 'tipo') return normalizeText(row.tipo_responsavel)
      if (field === 'status') return row.ativo === false ? '1' : '0'
      if (field === 'carteira') return normalizeText(row.carteiras?.nome)
      return normalizeText(row.condominios?.nome)
    }
    return getValue(a).localeCompare(getValue(b), 'pt-BR', { numeric: true })
  })
}

function groupResponsaveis(rows: any[]) {
  const groups = new Map<string, { id: string; nome: string; responsaveis: any[] }>()
  for (const row of rows) {
    const id = row.condominios?.id ?? row.condominio_id ?? 'sem-condominio'
    if (!groups.has(id)) groups.set(id, { id, nome: row.condominios?.nome ?? 'Condomínio não informado', responsaveis: [] })
    groups.get(id)!.responsaveis.push(row)
  }
  return Array.from(groups.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function tipoLabel(value?: string | null) {
  if (value === 'proprietario') return 'Proprietário'
  if (value === 'inquilino') return 'Inquilino'
  return 'Não informado'
}

function completenessLabel(row: any) {
  const missing = [
    !row.responsavel_nome ? 'nome' : null,
    !row.responsavel_documento ? 'documento' : null,
    !row.telefone ? 'telefone' : null,
    !row.email ? 'e-mail' : null,
  ].filter(Boolean)

  if (missing.length === 0) return 'Completo'
  return `${missing.length} pendência${missing.length > 1 ? 's' : ''}`
}

export default async function ResponsaveisPage({ searchParams }: ResponsaveisPageProps) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const page = getPageParam(params?.page)
  const ativoParam = getParam(params?.ativo)

  const filters = normalizeResponsavelUnidadeFilters({
    search: getParam(params?.q),
    carteiraId: getParam(params?.carteira_id),
    condominioId: getParam(params?.condominio_id),
    contato: getParam(params?.contato),
    ativo: ativoParam === undefined ? 'ativo' : ativoParam,
    tipoResponsavel: getParam(params?.tipo_responsavel),
  })

  const ordenar = getParam(params?.ordenar) ?? 'condominio'
  const [pageData, resumo, carteiras, condominios] = await Promise.all([
    listResponsaveisUnidadesPage(scope, filters, { page, pageSize: PAGE_SIZE, orderBy: ordenar }),
    summarizeResponsaveisUnidades(scope, filters),
    listCarteirasForSelect(scope),
    listCondominiosForSelect(scope),
  ])

  const rows = sortResponsaveis(pageData.rows, ordenar)
  const groups = groupResponsaveis(rows)
  const filtrosAtivos =
    Boolean(
      filters.search ||
      filters.carteiraId ||
      filters.condominioId ||
      filters.contato ||
      filters.tipoResponsavel ||
      (filters.ativo && filters.ativo !== 'ativo'),
    ) ||
    ordenar !== 'condominio'
  const paginationParams = {
    q: filters.search,
    carteira_id: filters.carteiraId,
    condominio_id: filters.condominioId,
    contato: filters.contato,
    ativo: filters.ativo,
    tipo_responsavel: filters.tipoResponsavel,
    ordenar,
  }
  const previousHref = page > 1 ? responsaveisHref(paginationParams, page - 1) : undefined
  const nextHref = page * PAGE_SIZE < pageData.total ? responsaveisHref(paginationParams, page + 1) : undefined

  return (
    <ListPage>
      <PageHeader
        eyebrow="Base Cadastral"
        title="Responsáveis"
        description="Índice dos responsáveis por unidade. Dados pessoais ficam no cadastro individual."
        actions={<ButtonLink href="/app/responsaveis/novo"><Plus size={16} />Novo responsável</ButtonLink>}
      />

      <ListKpiGrid className="md:grid-cols-4 xl:grid-cols-4">
        <KpiCard label="Ativos" value={resumo.ativos} icon={<UsersRound size={18} />} />
        <KpiCard label="Proprietários" value={resumo.proprietarios} />
        <KpiCard label="Inquilinos" value={resumo.inquilinos} />
        <KpiCard label="Incompletos" value={resumo.incompletos} />
      </ListKpiGrid>

      <ListPanel>
        <ListPanelHeader>
          <ListTitleBar>
            <ListTitle
              title="Cadastros de responsáveis"
              description="Abra o cadastro para visualizar ou alterar documento, telefone, e-mail e observações."
            />
            <ClearFiltersLink href="/app/responsaveis" show={filtrosAtivos} />
          </ListTitleBar>

          <ListFiltersForm className="grid-cols-1 md:grid-cols-2 xl:grid-cols-12">
            <ListSearchField
              placeholder="Condomínio, unidade, responsável ou contato"
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
              <Select name="ativo" defaultValue={filters.ativo ?? ''}>
                <option value="">Todos</option>
                <option value="ativo">Ativos</option>
                <option value="inativo">Inativos</option>
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
            <ListFilterField label="Tipo" className="xl:col-span-2">
              <Select name="tipo_responsavel" defaultValue={filters.tipoResponsavel ?? ''}>
                <option value="">Todos</option>
                <option value="proprietario">Proprietário</option>
                <option value="inquilino">Inquilino</option>
                <option value="nao_informado">Não informado</option>
              </Select>
            </ListFilterField>
            <ListFilterField label="Ordenar por" className="xl:col-span-3">
              <Select name="ordenar" defaultValue={ordenar}>
                <option value="condominio">Condomínio</option>
                <option value="unidade">Unidade</option>
                <option value="responsavel">Responsável</option>
                <option value="tipo">Tipo</option>
                <option value="status">Status</option>
                <option value="carteira">Carteira</option>
              </Select>
            </ListFilterField>
            <Button type="submit" className="w-full xl:col-span-1">
              Filtrar
            </Button>
          </ListFiltersForm>
        </ListPanelHeader>

        {rows.length === 0 ? (
          <ListEmptyState
            title="Nenhum responsável encontrado"
            description="Ajuste os filtros ou cadastre um responsável de apoio para enriquecer futuras importações."
          />
        ) : (
          <ListRows>
            {groups.map((group) => (
              <details key={group.id} className="group/condominio bg-white">
                <summary className="flex cursor-pointer list-none items-center gap-3 bg-slate-50/70 px-4 py-2.5 transition hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
                  <ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open/condominio:rotate-180" />
                  <div>
                    <ListItemTitle className="font-semibold">{group.nome}</ListItemTitle>
                    <ListItemMeta className="mt-0.5">{group.responsaveis.length} responsável(is) nesta página</ListItemMeta>
                  </div>
                </summary>
                <div className="divide-y divide-slate-100 border-t border-slate-100">
            {group.responsaveis.map((row: any) => {
              const href = `/app/responsaveis/${row.id}`
              const completo = completenessLabel(row) === 'Completo'
              return (
                <ListRow
                  key={row.id}
                  className="xl:grid-cols-[minmax(240px,1.2fr)_150px_170px_150px_130px_120px]"
                >
                  <Link href={href} className="min-w-0">
                    <ListItemTitle>{row.responsavel_nome || 'Responsável não informado'}</ListItemTitle>
                    <ListItemMeta>{row.carteiras?.nome ?? '-'} · origem {row.origem ?? '-'}</ListItemMeta>
                  </Link>
                  <Link href={href} className="min-w-0 text-sm text-slate-700">
                    <span className="block truncate">Bloco {row.bloco || '-'}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">Unidade {row.unidade || '-'}</span>
                  </Link>
                  <Link href={href} className="min-w-0">
                    <ListItemTitle>{tipoLabel(row.tipo_responsavel)}</ListItemTitle>
                    <ListItemMeta>{row.email ?? row.telefone ?? 'Contato não informado'}</ListItemMeta>
                  </Link>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={row.ativo !== false ? 'green' : 'slate'}>{row.ativo !== false ? 'Ativo' : 'Inativo'}</Badge>
                    <Badge tone={completo ? 'green' : 'yellow'}>{completenessLabel(row)}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Atualizado em {row.updated_at ? new Intl.DateTimeFormat('pt-BR').format(new Date(row.updated_at)) : '-'}
                  </p>
                  <ButtonLink href={href} variant="secondary" size="sm">
                    <Edit3 size={14} />
                    Editar
                  </ButtonLink>
                </ListRow>
              )
            })}
                </div>
              </details>
            ))}
          </ListRows>
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
