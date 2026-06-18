import Link from 'next/link'
import { Button, ButtonLink } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import {
  ClearFiltersLink,
  ListFilterField,
  ListFiltersForm,
  ListSearchField,
  ListTitle,
  ListTitleBar,
} from '@/components/layout/list-page'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listLotesRegua } from '@/features/lotes/queries'
import { formatDateBR } from '@/utils/formatters/date'

type LotesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function n(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function getParam(value: string | string[] | undefined) {
  return String(Array.isArray(value) ? value[0] : value ?? '').trim()
}

function normalizeText(value: unknown) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function matchesLote(row: any, filters: Record<string, string>) {
  const q = normalizeText(filters.q)
  const haystack = normalizeText([row.id, row.tipo, row.status, row.observacoes, row.resumo?.regua_id].filter(Boolean).join(' '))

  if (q && !haystack.includes(q)) return false
  if (filters.tipo && row.tipo !== filters.tipo) return false
  if (filters.status && row.status !== filters.status) return false
  if (filters.resultado === 'com_erros' && n(row.total_erros) <= 0) return false
  if (filters.resultado === 'com_criadas' && n(row.total_criadas) <= 0) return false
  if (filters.resultado === 'com_duplicadas' && n(row.total_duplicadas) <= 0) return false
  return true
}

function reguaLabel(row: any) {
  const reguaId = row.resumo?.regua_id
  if (!reguaId) return 'Régua não identificada'
  if (String(reguaId).startsWith('default-')) return 'Padrão interno'
  return `Régua ${String(reguaId).slice(0, 8)}`
}

export default async function LotesPage({ searchParams }: LotesPageProps) {
  const params = searchParams ? await searchParams : {}
  const scope = await getPermittedCarteiras()
  const rowsBase = await listLotesRegua(scope)
  const filters = {
    q: getParam(params.q),
    tipo: getParam(params.tipo),
    status: getParam(params.status),
    resultado: getParam(params.resultado),
  }
  const rows = rowsBase.filter((row: any) => matchesLote(row, filters))
  const hasFilters = Object.values(filters).some(Boolean)

  const totalCriadas = rows.reduce((sum: number, row: any) => sum + n(row.total_criadas), 0)
  const totalDuplicadas = rows.reduce((sum: number, row: any) => sum + n(row.total_duplicadas), 0)
  const totalErros = rows.reduce((sum: number, row: any) => sum + n(row.total_erros), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Base Operacional"
        title="Lotes"
        description="Histórico real dos processamentos da régua, com rastreabilidade, duplicidades bloqueadas e resumo operacional."
        actions={
          <ButtonLink href="/app/mensageria" variant="header">
            Ir para Mensageria
          </ButtonLink>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-400">Lotes</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{rows.length}</p>
          <p className="mt-1 text-sm text-slate-500">processamentos registrados</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-400">Criadas</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{totalCriadas}</p>
          <p className="mt-1 text-sm text-slate-500">mensagens geradas</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-400">Duplicadas</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{totalDuplicadas}</p>
          <p className="mt-1 text-sm text-slate-500">bloqueadas por fingerprint</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-400">Erros</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{totalErros}</p>
          <p className="mt-1 text-sm text-slate-500">exigem revisão</p>
        </Card>
      </div>

      <Card className="p-5">
        <ListTitleBar>
          <ListTitle title="Filtros" description="Localize lotes por texto, tipo, status ou resultado." />
          <ClearFiltersLink href="/app/lotes" show={hasFilters} />
        </ListTitleBar>
        <ListFiltersForm className="xl:grid-cols-[minmax(260px,1.2fr)_170px_170px_190px_auto]">
          <ListSearchField defaultValue={filters.q} placeholder="ID, observação, tipo ou status" />
          <ListFilterField label="Tipo">
            <Select name="tipo" defaultValue={filters.tipo}>
              <option value="">Todos</option>
              <option value="regua_cobranca">Régua cobrança</option>
              <option value="regua_acordo">Régua acordo</option>
              <option value="mensageria">Mensageria</option>
            </Select>
          </ListFilterField>
          <ListFilterField label="Status">
            <Select name="status" defaultValue={filters.status}>
              <option value="">Todos</option>
              <option value="processando">Processando</option>
              <option value="gerado">Gerado</option>
              <option value="concluido">Concluído</option>
              <option value="concluido_com_falhas">Com falhas</option>
              <option value="erro">Erro</option>
            </Select>
          </ListFilterField>
          <ListFilterField label="Resultado">
            <Select name="resultado" defaultValue={filters.resultado}>
              <option value="">Todos</option>
              <option value="com_criadas">Com mensagens</option>
              <option value="com_duplicadas">Com duplicadas</option>
              <option value="com_erros">Com erros</option>
            </Select>
          </ListFilterField>
          <Button type="submit">Filtrar</Button>
        </ListFiltersForm>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="Nenhum lote registrado" description="Gere um lote em Mensageria para iniciar o histórico operacional." />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-950">Histórico de lotes</h2>
            <p className="mt-1 text-xs text-slate-500">Cada linha representa uma execução da régua sobre cobranças abertas.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => (
              <Link key={row.id} href={`/app/lotes/${row.id}`} className="grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[1fr_120px_110px_110px_110px_110px_120px] xl:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    Lote {String(row.id).slice(0, 8)} · {row.tipo ?? 'cobranca'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {reguaLabel(row)} · {row.observacoes ?? 'Processamento da régua'} · criado em {formatDateBR(row.created_at)}
                  </p>
                </div>
                <StatusBadge status={String(row.status ?? 'gerado')} />
                <div>
                  <p className="text-xs font-medium uppercase text-slate-400">Avaliadas</p>
                  <p className="mt-1 text-sm text-slate-700">{n(row.total_avaliadas)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-slate-400">Criadas</p>
                  <p className="mt-1 text-sm text-slate-700">{n(row.total_criadas)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-slate-400">Puladas</p>
                  <p className="mt-1 text-sm text-slate-700">{n(row.total_puladas)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-slate-400">Duplicadas</p>
                  <p className="mt-1 text-sm text-slate-700">{n(row.total_duplicadas)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-slate-400">Erros</p>
                  <p className="mt-1 text-sm text-slate-700">{n(row.total_erros)}</p>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
