import Link from 'next/link'
import { ArrowUpRight, Handshake, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { CheckAcordosStatusButton } from '@/components/acordos/check-status-button'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listAcordos } from '@/features/acordos/queries'

function sumBy(rows: any[], predicate: (row: any) => boolean) {
  return rows.filter(predicate).reduce((sum, row) => sum + Number(row.valor_acordado ?? 0), 0)
}

type PageProps = {
  searchParams?: Promise<{
    q?: string
    status?: string
    tipo?: string
    order_by?: string
    order_dir?: string
  }>
}

function clean(value?: string) {
  return String(value ?? '').trim()
}

export default async function AcordosPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {}
  const filters = {
    search: clean(params.q),
    status: clean(params.status),
    tipo: clean(params.tipo),
    orderBy: clean(params.order_by) || 'data_acordo',
    orderDir: clean(params.order_dir) || 'desc',
  }
  const hasFilters = Boolean(filters.search || filters.status || filters.tipo || filters.orderBy !== 'data_acordo' || filters.orderDir !== 'desc')

  const scope = await getPermittedCarteiras()
  const rows = await listAcordos(scope, filters)

  const ativos = rows.filter((row: any) => row.status === 'ativo').length
  const atraso = rows.filter((row: any) => row.status === 'em atraso').length
  const rompidos = rows.filter((row: any) => row.status === 'rompido').length
  const valorAtivo = sumBy(rows, (row: any) => ['ativo', 'em atraso'].includes(row.status))

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base Operacional"
        title="Acordos"
        description="Controle acordos, parcelas, atrasos e quebras operacionais."
        actions={
          <>
            <CheckAcordosStatusButton />

            <ButtonLink href="/app/acordos/novo"><Plus size={16} />Novo acordo</ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><Handshake size={18} /></div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor ativo</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{formatCurrency(valorAtivo)}</p>
          <p className="mt-1 text-sm text-slate-500">em acordos ativos ou em atraso</p>
        </Card>
        {[
          ['Ativos', ativos, 'andamento', 'bg-emerald-50 text-emerald-700'],
          ['Em atraso', atraso, 'atenção', 'bg-amber-50 text-amber-700'],
          ['Rompidos', rompidos, 'risco', 'bg-red-50 text-red-700'],
        ].map(([title, value, tag, tagClass]) => (
          <Card key={title} className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{title}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tagClass}`}>{tag}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">status operacional</p>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 bg-white/80 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-base font-medium text-slate-950">Fila de acordos</h2>
              <p className="mt-1 text-sm text-slate-500">Clique para controlar parcelas, cancelamento ou quebra.</p>
            </div>
            <form className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_150px_150px_170px_140px_110px]">
              <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input name="q" defaultValue={filters.search} className="pl-9" placeholder="Buscar responsável, unidade..." /></div>
              <Select name="status" defaultValue={filters.status}>
                <option value="">Todos os status</option>
                <option value="ativo">Ativo</option>
                <option value="em atraso">Em atraso</option>
                <option value="rompido">Rompido</option>
                <option value="quitado">Quitado</option>
                <option value="cancelado">Cancelado</option>
              </Select>
              <Select name="tipo" defaultValue={filters.tipo}>
                <option value="">Todos os tipos</option>
                <option value="extrajudicial">Extrajudicial</option>
                <option value="judicial">Judicial</option>
              </Select>
              <Select name="order_by" defaultValue={filters.orderBy}>
                <option value="data_acordo">Data do acordo</option>
                <option value="operacional">Condomínio → Unidade</option>
                <option value="condominio">Condomínio</option>
                <option value="unidade">Unidade</option>
                <option value="responsavel">Responsável</option>
                <option value="valor_acordado">Valor acordado</option>
                <option value="entrada">Entrada</option>
                <option value="status">Status</option>
                <option value="tipo">Tipo</option>
              </Select>
              <Select name="order_dir" defaultValue={filters.orderDir}>
                <option value="asc">Crescente</option>
                <option value="desc">Decrescente</option>
              </Select>
              <Button type="submit" variant="secondary">Filtrar</Button>
            </form>
          </div>
          {hasFilters ? (
            <div className="mt-3">
              <ButtonLink href="/app/acordos" variant="secondary">Limpar filtros</ButtonLink>
            </div>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <div className="p-5"><EmptyState title="Nenhum acordo encontrado" description="Crie acordos a partir das cobranças negociadas." /></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => (
              <Link key={row.id} href={`/app/acordos/${row.id}`} className="group grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1.4fr)_140px_160px_150px_90px] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={row.status} /><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{row.tipo}</span></div>
                  <p className="mt-2 truncate text-sm font-medium text-slate-950">{row.unidades?.responsavel_nome ?? 'Responsável não informado'}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{row.condominios?.nome ?? '-'} · Unidade {row.unidades?.identificacao ?? '-'} {row.numero_processo ? `· proc. ${row.numero_processo}` : ''}</p>
                </div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor</p><p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_acordado))}</p></div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Entrada</p><p className="mt-1 text-sm text-slate-700">{formatCurrency(Number(row.entrada))}</p></div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Data</p><p className="mt-1 text-sm text-slate-700">{formatDateBR(row.data_acordo)}</p></div>
                <div className="flex justify-end"><ArrowUpRight size={16} className="text-slate-400 group-hover:text-[var(--gkli-primary)]" /></div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
