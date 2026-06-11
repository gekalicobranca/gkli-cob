import Link from 'next/link'
import { ArrowUpRight, Building2, Download, Edit3, Filter, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
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
  hasCondominioFilters,
  listAdministradorasCondominios,
  listCondominios,
  normalizeCondominioFilters,
} from '@/features/condominios/queries'

type CondominiosPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function sortCondominios(rows: any[], ordenar: string) {
  const field = ordenar || 'nome'
  return [...rows].sort((a, b) => {
    const getValue = (row: any) => {
      if (field === 'administradora') return normalizeText(row.administradora)
      if (field === 'status') return normalizeText(row.status)
      if (field === 'carteira') return normalizeText(row.carteiras?.nome)
      if (field === 'regua_asc' || field === 'regua_desc') return Number(row.inicio_cobranca_dias ?? 0)
      if (field === 'cota_asc' || field === 'cota_desc') return Number(row.valor_cota_condominial ?? 0)
      return normalizeText(row.nome_operacional || row.nome)
    }
    const av = getValue(a)
    const bv = getValue(b)
    if (typeof av === 'number' && typeof bv === 'number') return field.endsWith('_desc') ? bv - av : av - bv
    return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true })
  })
}

export default async function CondominiosPage({ searchParams }: CondominiosPageProps) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()

  const filters = normalizeCondominioFilters({
    search: getParam(params?.q),
    carteiraId: getParam(params?.carteira_id),
    administradora: getParam(params?.administradora),
    status: getParam(params?.status),
  })

  const [rowsBase, carteiras, administradoras] = await Promise.all([
    listCondominios(scope, filters),
    listCarteirasForSelect(scope),
    listAdministradorasCondominios(scope),
  ])

  const ordenar = getParam(params?.ordenar) ?? 'nome'
  const rows = sortCondominios(rowsBase, ordenar)
  const filtrosAtivos = hasCondominioFilters(filters) || ordenar !== 'nome'
  const exportParams = new URLSearchParams()

  if (filters.carteiraId) exportParams.set('carteira_id', filters.carteiraId)

  const exportCondominiosHref = `/api/condominios/exportacoes/condominios${exportParams.toString() ? `?${exportParams.toString()}` : ''}`
  const ativos = rows.filter((row: any) => row.status === 'ativo').length
  const mediaRegua = rows.length
    ? Math.round(rows.reduce((sum: number, row: any) => sum + Number(row.inicio_cobranca_dias ?? 0), 0) / rows.length)
    : 0
  const ticketMedio = rows.length
    ? rows.reduce((sum: number, row: any) => sum + Number(row.valor_cota_condominial ?? 0), 0) / rows.length
    : 0

  return (
    <ListPage>
      <PageHeader
        eyebrow="Base Cadastral"
        title="Condomínios"
        description="Base de condomínios, filtros operacionais, regras de início de cobrança e vínculo com carteiras."
        actions={
          <>
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
        <Card className="relative overflow-hidden p-3">
          <div className="absolute right-4 top-3 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
            <Building2 size={18} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Ativos</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950">{ativos}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Régua média</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950">D+{mediaRegua}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Cota média</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950">{formatCurrency(ticketMedio)}</p>
        </Card>
      </ListKpiGrid>

      <ListPanel>
        <ListPanelHeader>
          <ListTitleBar>
            <ListTitle title="Base cadastral" />
            <ClearFiltersLink href="/app/condominios" show={filtrosAtivos} />
          </ListTitleBar>

          <ListFiltersForm className="lg:grid-cols-[minmax(220px,1.4fr)_minmax(180px,.9fr)_minmax(180px,.9fr)_150px_190px_auto] lg:items-end">
            <ListSearchField
              placeholder="Nome, nome operacional, CNPJ ou administradora"
              defaultValue={filters.search ?? ''}
            />
            <ListFilterField label="Carteira">
              <Select name="carteira_id" defaultValue={filters.carteiraId ?? ''}>
                <option value="">Todas</option>
                {carteiras.map((carteira: any) => (
                  <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>
                ))}
              </Select>
            </ListFilterField>
            <ListFilterField label="Administradora">
              <Select name="administradora" defaultValue={filters.administradora ?? ''}>
                <option value="">Todas</option>
                {administradoras.map((administradora) => (
                  <option key={administradora} value={administradora}>{administradora}</option>
                ))}
              </Select>
            </ListFilterField>
            <ListFilterField label="Status">
              <Select name="status" defaultValue={filters.status ?? ''}>
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="suspenso">Suspenso</option>
              </Select>
            </ListFilterField>
            <ListFilterField label="Ordenar por">
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
            <Button type="submit" className="lg:w-auto">
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
                  <p className="truncate text-sm font-medium text-slate-950 group-hover:text-[var(--gkli-primary)]">
                    {row.nome_operacional || row.nome || 'Nome não informado'}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {row.nome_operacional && row.nome_operacional !== row.nome ? `Oficial: ${row.nome} · ` : ''}
                    {row.administradora ?? '-'} · CNPJ {row.cnpj ?? '-'} · {row.carteiras?.nome ?? '-'}
                  </p>
                </Link>

                <ClassificacaoOperacionalBadge value={row.classificacao_operacional} />
                <StatusBadge status={row.status} />

                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Régua</p>
                  <p className="mt-1 text-sm text-slate-700">D+{row.inicio_cobranca_dias}</p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Cota</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    {formatCurrency(Number(row.valor_cota_condominial ?? 0))}
                  </p>
                </div>

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
      </ListPanel>
    </ListPage>
  )
}
