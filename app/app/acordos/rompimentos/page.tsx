import Link from 'next/link'
import { AlertTriangle, ArrowUpRight, Filter, Search, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listRompimentosAcordos } from '@/features/acordos/queries'

type SearchParams = Promise<{
  q?: string
  status?: string
  data_de?: string
  data_ate?: string
  ordenar?: string
}>

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeText(value: unknown) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function dateValue(value: unknown) {
  const text = clean(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function filterRows(rows: any[], params: Awaited<SearchParams>) {
  const termo = normalizeText(params.q)
  const status = clean(params.status)
  const dataDe = dateValue(params.data_de)
  const dataAte = dateValue(params.data_ate)

  return rows.filter((row) => {
    const data = clean(row.data_acordo).slice(0, 10)
    if (status && row.status !== status && row.status_financeiro !== status) return false
    if (dataDe && data < dataDe) return false
    if (dataAte && data > dataAte) return false

    if (termo) {
      const haystack = normalizeText([
        row.condominios?.nome,
        row.unidades?.identificacao,
        row.unidades?.bloco,
        row.unidades?.responsavel_nome,
        row.status,
        row.status_financeiro,
      ].filter(Boolean).join(' '))
      if (!haystack.includes(termo)) return false
    }

    return true
  })
}

function sortRows(rows: any[], ordenar: string) {
  const field = ordenar || 'data_desc'
  return [...rows].sort((a, b) => {
    const getValue = (row: any) => {
      if (field === 'data_asc' || field === 'data_desc') return new Date(row.data_acordo ?? 0).getTime()
      if (field === 'valor_asc' || field === 'valor_desc') return Number(row.valor_acordado ?? 0)
      if (field === 'condominio') return normalizeText(row.condominios?.nome)
      if (field === 'unidade') return normalizeText(row.unidades?.identificacao)
      if (field === 'responsavel') return normalizeText(row.unidades?.responsavel_nome)
      if (field === 'status') return normalizeText(row.status)
      return new Date(row.data_acordo ?? 0).getTime()
    }
    const av = getValue(a)
    const bv = getValue(b)
    if (typeof av === 'number' && typeof bv === 'number') return field.endsWith('_desc') ? bv - av : av - bv
    return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true })
  })
}

export default async function RompimentosAcordosPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const rows = sortRows(filterRows(await listRompimentosAcordos(scope), params), clean(params.ordenar) || 'data_desc')
  const valor = rows.reduce((sum: number, row: any) => sum + Number(row.valor_acordado ?? 0), 0)
  const hasFilters = Boolean(params.q || params.status || params.data_de || params.data_ate || params.ordenar)

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Acordos"
        title="Rompimentos"
        description="Lista enxuta para retomar negociação, suspender ou apenas acompanhar risco."
        actions={<ButtonLink href="/app/acordos" variant="secondary">Voltar</ButtonLink>}
      />

      <section className="grid gap-2 md:grid-cols-2">
        <Card className="p-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Rompimentos</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{rows.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor em risco</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{formatCurrency(valor)}</p>
        </Card>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 bg-white/80 px-4 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-red-50 p-2 text-red-700"><AlertTriangle size={18} /></div>
              <div>
                <h2 className="text-base font-medium text-slate-950">Acordos rompidos ou vencidos</h2>
                
              </div>
            </div>
            {hasFilters ? <ButtonLink href="/app/acordos/rompimentos" variant="secondary" size="sm"><X size={15} />Limpar</ButtonLink> : null}
          </div>

          <form className="mt-3 grid gap-3 xl:grid-cols-[minmax(220px,1fr)_150px_155px_155px_190px_auto] xl:items-end">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Busca</span>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input name="q" defaultValue={clean(params.q)} className="pl-9" placeholder="Condomínio, unidade, responsável..." />
              </div>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Status</span>
              <Select name="status" defaultValue={clean(params.status)}>
                <option value="">Todos</option>
                <option value="quebrado">Quebrado</option>
                <option value="rompido">Rompido</option>
                <option value="cancelado">Cancelado</option>
                <option value="vencido">Vencido</option>
              </Select>
            </label>
            <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Data início</span><Input name="data_de" type="date" defaultValue={dateValue(params.data_de)} /></label>
            <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Data fim</span><Input name="data_ate" type="date" defaultValue={dateValue(params.data_ate)} /></label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Ordenar por</span>
              <Select name="ordenar" defaultValue={clean(params.ordenar) || 'data_desc'}>
                <option value="data_desc">Data mais recente</option>
                <option value="data_asc">Data mais antiga</option>
                <option value="valor_desc">Maior valor</option>
                <option value="valor_asc">Menor valor</option>
                <option value="condominio">Condomínio</option>
                <option value="unidade">Unidade</option>
                <option value="responsavel">Responsável</option>
                <option value="status">Status</option>
              </Select>
            </label>
            <Button type="submit"><Filter size={16} />Filtrar</Button>
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="p-3"><EmptyState title="Nenhum rompimento" description="Não há acordos rompidos ou vencidos no escopo atual." /></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => (
              <Link key={row.id} href={`/app/acordos/${row.id}`} className="group grid gap-3 px-4 py-3 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1.4fr)_160px_150px_90px] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={row.status} /><span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">revisar</span></div>
                  <p className="mt-2 truncate text-sm font-medium text-slate-950">{row.condominios?.nome ?? 'Condomínio não informado'} · Unidade {row.unidades?.identificacao ?? '-'}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{row.unidades?.responsavel_nome ?? 'Responsável não informado'}</p>
                </div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor</p><p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_acordado ?? 0))}</p></div>
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
