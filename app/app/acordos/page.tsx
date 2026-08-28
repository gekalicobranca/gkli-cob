import Link from 'next/link'
import { AlertTriangle, ArrowUpRight, ChevronDown, FileText, Handshake, Inbox } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { KpiCard } from '@/components/ui/kpi-card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CondominioSearchSelect } from '@/components/gestao/condominio-search-select'
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
  ListRows,
  ListSearchField,
  ListTitle,
  ListTitleBar,
} from '@/components/layout/list-page'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCondominiosForSelect, listUnidadesForSelect } from '@/features/cadastros/queries'
import { listAcordosComSaude } from '@/features/acordos/queries'
import { listCarteiras } from '@/features/carteiras/queries'
import { AgreementHealthBadge } from '@/features/acordos/components/agreement-health-badge'

type AcordosPageProps = {
  searchParams?: Promise<{
    q?: string
    condominio_id?: string
    unidade_id?: string
    carteira_id?: string
    status?: string
    data_de?: string
    data_ate?: string
    ordenar?: string
    page?: string
  }>
}

const PAGE_SIZE = 100

function getPageParam(value: unknown) {
  const page = Number(value ?? 1)
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

function pageHref(params: Record<string, string | undefined>, page: number) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'page' && value) query.set(key, value)
  }
  query.set('page', String(page))
  return `/app/acordos?${query.toString()}`
}

function acordosRelatorioExecutivoHref(params: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const key of ['q', 'condominio_id', 'unidade_id', 'carteira_id', 'status', 'data_de', 'data_ate', 'ordenar']) {
    const value = params[key]
    if (value) query.set(key, value)
  }
  const qs = query.toString()
  return qs ? `/api/acordos/relatorio-executivo?${qs}` : '/api/acordos/relatorio-executivo'
}

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeText(value: unknown) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function dateFilter(value: unknown) {
  const text = clean(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function sumBy(rows: any[], predicate: (row: any) => boolean) {
  return rows.filter(predicate).reduce((sum, row) => sum + Number(row.valor_acordado ?? 0), 0)
}

function getUnitLabel(unidade: any) {
  if (!unidade) return 'Unidade não informada'
  const bloco = unidade.bloco ? `Bloco ${unidade.bloco} · ` : ''
  return `${bloco}Unidade ${unidade.identificacao ?? '-'}`
}

function getComparable(row: any, field: string) {
  if (field === 'data_asc' || field === 'data_desc') return new Date(row.data_acordo ?? 0).getTime()
  if (field === 'valor_asc' || field === 'valor_desc') return Number(row.valor_acordado ?? 0)
  if (field === 'condominio') return normalizeText(row.condominios?.nome)
  if (field === 'unidade') return normalizeText(row.unidades?.identificacao)
  if (field === 'responsavel') return normalizeText(row.unidades?.responsavel_nome)
  if (field === 'status') return normalizeText(row.status)
  return normalizeText(row.condominios?.nome)
}

function sortAcordos(rows: any[], ordenar: string) {
  return [...rows].sort((a, b) => {
    const field = ordenar || 'condominio'
    const av = getComparable(a, field)
    const bv = getComparable(b, field)

    if (typeof av === 'number' && typeof bv === 'number') {
      return field.endsWith('_desc') ? bv - av : av - bv
    }

    const result = String(av).localeCompare(String(bv), 'pt-BR', { numeric: true })
    if (result !== 0) return result

    return String(a.unidades?.identificacao ?? '').localeCompare(String(b.unidades?.identificacao ?? ''), 'pt-BR', { numeric: true })
  })
}

function filterAcordos(rows: any[], filters: Awaited<NonNullable<AcordosPageProps['searchParams']>>) {
  const termo = normalizeText(filters.q)
  const condominioId = clean(filters.condominio_id)
  const unidadeId = clean(filters.unidade_id)
  const carteiraId = clean(filters.carteira_id)
  const status = clean(filters.status)
  const dataDe = dateFilter(filters.data_de)
  const dataAte = dateFilter(filters.data_ate)

  return rows.filter((row) => {
    const data = clean(row.data_acordo).slice(0, 10)
    if (condominioId && row.condominio_id !== condominioId) return false
    if (unidadeId && row.unidade_id !== unidadeId) return false
    if (carteiraId && row.carteira_id !== carteiraId) return false
    if (status && row.status !== status) return false
    if (dataDe && data < dataDe) return false
    if (dataAte && data > dataAte) return false

    if (termo) {
      const haystack = normalizeText([
        row.condominios?.nome,
        row.unidades?.identificacao,
        row.unidades?.bloco,
        row.unidades?.responsavel_nome,
        row.numero_processo,
        row.status,
        row.carteiras?.nome,
      ].filter(Boolean).join(' '))
      if (!haystack.includes(termo)) return false
    }

    return true
  })
}

function groupAcordos(rows: any[]) {
  const groups: Array<{ condominioId: string; condominio: string; acordos: any[] }> = []
  for (const row of rows) {
    const condominioId = row.condominios?.id ?? 'sem-condominio'
    let group = groups.find((item) => item.condominioId === condominioId)
    if (!group) {
      group = {
        condominioId,
        condominio: row.condominios?.nome ?? 'Condomínio não informado',
        acordos: [],
      }
      groups.push(group)
    }
    group.acordos.push(row)
  }
  return groups
}

export default async function AcordosPage({ searchParams }: AcordosPageProps) {
  const params = searchParams ? await searchParams : {}
  const scope = await getPermittedCarteiras()
  const [allRows, condominios, unidades, carteiras] = await Promise.all([
    listAcordosComSaude(scope),
    listCondominiosForSelect(scope),
    clean(params.condominio_id)
      ? listUnidadesForSelect(scope, { condominioId: clean(params.condominio_id) })
      : Promise.resolve([]),
    listCarteiras(scope),
  ])
  const filteredRows = sortAcordos(filterAcordos(allRows, params), clean(params.ordenar) || 'condominio')
  const page = getPageParam(params.page)
  const rows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const groups = groupAcordos(rows)
  const hasFilters = Boolean(params.q || params.condominio_id || params.unidade_id || params.carteira_id || params.status || params.data_de || params.data_ate || params.ordenar)

  const ativos = filteredRows.filter((row: any) => row.status === 'ativo').length
  const atraso = filteredRows.filter((row: any) => row.status === 'em atraso').length
  const rompidos = filteredRows.filter((row: any) => row.status === 'rompido').length
  const valorAtivo = sumBy(filteredRows, (row: any) => ['ativo', 'em atraso'].includes(row.status))

  return (
    <ListPage>
      <PageHeader
        eyebrow="Base Operacional"
        title="Acordos"
        description="Controle acordos, parcelas, atrasos e quebras operacionais."
        actions={
          <>
            <ButtonLink href={acordosRelatorioExecutivoHref(params)} variant="secondary" target="_blank"><FileText size={16} />Relatório executivo</ButtonLink>
            <ButtonLink href="/app/acordos/fila" variant="secondary"><Inbox size={16} />Fila</ButtonLink>
            <ButtonLink href="/app/acordos/gestao" variant="secondary"><AlertTriangle size={16} />Gestão de quebrados</ButtonLink>
          </>
        }
      />

      <ListKpiGrid>
        <KpiCard label="Valor ativo" value={formatCurrency(valorAtivo)} icon={<Handshake size={18} />} />
        {[
          ['Ativos', ativos, 'andamento', 'bg-emerald-50 text-emerald-700'],
          ['Em atraso', atraso, 'atenção', 'bg-amber-50 text-amber-700'],
          ['Rompidos', rompidos, 'risco', 'bg-red-50 text-red-700'],
        ].map(([title, value, tag, tagClass]) => (
          <KpiCard
            key={title}
            label={String(title)}
            value={value}
            badge={<span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tagClass}`}>{tag}</span>}
          />
        ))}
      </ListKpiGrid>

      <ListPanel>
        <ListPanelHeader className="bg-white/80">
          <ListTitleBar className="xl:items-center">
            <ListTitle title="Fila de acordos" />
            <ClearFiltersLink href="/app/acordos" show={hasFilters} />
          </ListTitleBar>

          <ListFiltersForm className="grid-cols-1 md:grid-cols-2 xl:grid-cols-12">
            <ListSearchField
              defaultValue={clean(params.q)}
              placeholder="Condomínio, unidade, responsável..."
              className="xl:col-span-3"
            />
            <ListFilterField label="Condomínio" className="xl:col-span-5">
              <CondominioSearchSelect
                name="condominio_id"
                options={condominios.map((condominio: any) => ({
                  id: condominio.id,
                  nome: condominio.nome,
                  administradora: null,
                }))}
                selectedId={clean(params.condominio_id)}
                defaultToFirst={false}
                inputClassName=""
              />
            </ListFilterField>
            <ListFilterField label="Unidade" className="xl:col-span-4">
              <SearchableSelect
                name="unidade_id"
                options={unidades.map((unidade: any) => ({
                  value: unidade.id,
                  label: [
                    unidade.bloco ? `Bloco ${unidade.bloco}` : null,
                    unidade.identificacao ? `Unidade ${unidade.identificacao}` : null,
                    unidade.responsavel_nome,
                  ].filter(Boolean).join(" - "),
                }))}
                selectedValue={clean(params.unidade_id)}
                placeholder={clean(params.condominio_id) ? "Digite unidade ou responsável" : "Selecione um condomínio primeiro"}
              />
            </ListFilterField>
            <ListFilterField label="Status" className="xl:col-span-2">
              <Select name="status" defaultValue={clean(params.status)}>
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="em atraso">Em atraso</option>
                <option value="quebrado">Quebrado</option>
                <option value="rompido">Rompido</option>
                <option value="quitado">Quitado</option>
                <option value="cancelado">Cancelado</option>
              </Select>
            </ListFilterField>
            <ListFilterField label="Carteira" className="xl:col-span-2">
              <Select name="carteira_id" defaultValue={clean(params.carteira_id)}>
                <option value="">Todas</option>
                {carteiras.map((carteira: any) => (
                  <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>
                ))}
              </Select>
            </ListFilterField>
            <ListFilterField label="Data início" className="xl:col-span-2">
              <Input name="data_de" type="date" defaultValue={dateFilter(params.data_de)} />
            </ListFilterField>
            <ListFilterField label="Data fim" className="xl:col-span-2">
              <Input name="data_ate" type="date" defaultValue={dateFilter(params.data_ate)} />
            </ListFilterField>
            <ListFilterField label="Ordenar por" className="xl:col-span-3">
              <Select name="ordenar" defaultValue={clean(params.ordenar) || 'condominio'}>
                <option value="condominio">Condomínio</option>
                <option value="unidade">Unidade</option>
                <option value="responsavel">Responsável</option>
                <option value="status">Status</option>
                <option value="data_desc">Data mais recente</option>
                <option value="data_asc">Data mais antiga</option>
                <option value="valor_desc">Maior valor</option>
                <option value="valor_asc">Menor valor</option>
              </Select>
            </ListFilterField>
            <Button type="submit" className="w-full xl:col-span-1">
              Filtrar
            </Button>
          </ListFiltersForm>
        </ListPanelHeader>

        {rows.length === 0 ? (
          <ListEmptyState title="Nenhum acordo encontrado" description="Crie acordos a partir das cobranças negociadas." />
        ) : (
          <ListRows>
            {groups.map((group) => (
              <details key={group.condominioId} className="group/condominio bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-slate-50/70 px-4 py-2.5 transition hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
                  <div className="flex min-w-0 items-center gap-3">
                    <ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open/condominio:rotate-180" />
                    <div className="min-w-0">
                    <ListItemTitle className="font-semibold">{group.condominio}</ListItemTitle>
                    <ListItemMeta className="mt-0.5">{group.acordos.length} acordo(s)</ListItemMeta>
                    </div>
                  </div>
                </summary>
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {group.acordos.map((row: any) => (
                    <Link
                      key={row.id}
                      href={`/app/acordos/${row.id}`}
                      className="group grid gap-3 px-4 py-3 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1.4fr)_120px_140px_150px_90px] xl:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={row.status} />
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{row.carteiras?.nome ?? 'Carteira não informada'}</span>
                        </div>
                        <ListItemTitle className="mt-2">{getUnitLabel(row.unidades)}</ListItemTitle>
                        <ListItemMeta>
                          {row.unidades?.responsavel_nome ?? 'Responsável não informado'} {row.numero_processo ? `· proc. ${row.numero_processo}` : ''}
                        </ListItemMeta>
                      </div>
                      <ListMetric
                        label="Valor"
                        value={formatCurrency(Number(row.valor_acordado))}
                        valueClassName="font-semibold text-slate-950"
                      />
                      <div>
                        <p className="text-xs font-medium uppercase tracking-normal text-slate-400">Saúde</p>
                        <div className="mt-1"><AgreementHealthBadge health={row.saude_acordo} /></div>
                      </div>
                      <ListMetric label="Data" value={formatDateBR(row.data_acordo)} />
                      <div className="flex justify-end"><ArrowUpRight size={16} className="text-slate-400 group-hover:text-[var(--gkli-primary)]" /></div>
                    </Link>
                  ))}
                </div>
              </details>
            ))}
          </ListRows>
        )}
        <ListPagination
          page={page}
          pageSize={PAGE_SIZE}
          total={filteredRows.length}
          previousHref={page > 1 ? pageHref(params, page - 1) : undefined}
          nextHref={page * PAGE_SIZE < filteredRows.length ? pageHref(params, page + 1) : undefined}
        />
      </ListPanel>
    </ListPage>
  )
}
