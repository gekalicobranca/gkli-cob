import Link from 'next/link'
import { AlertCircle, CheckCircle2, Files, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { ClearFiltersLink, ListCollapsibleFilters, ListFilterField, ListFiltersForm, ListSearchField } from '@/components/layout/list-page'
import { listLotesRegua } from '@/features/lotes/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { formatDateBR } from '@/utils/formatters/date'

type Params = Promise<{ q?: string; status?: string; resultado?: string }>
const n = (value: unknown) => Number(value ?? 0) || 0
const norm = (value: unknown) => String(value ?? '').trim().toLowerCase()
const relation = (value: any) => Array.isArray(value) ? value[0] : value

export default async function LotesPreJuridicoPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const baseRows = await listLotesRegua(scope, { tipo: 'pre_juridico' })
  const rows = baseRows.filter((row: any) => {
    if (params.status && row.status !== params.status) return false
    if (params.resultado === 'com_mensagens' && n(row.total_criadas) === 0) return false
    if (params.resultado === 'com_duplicadas' && n(row.total_duplicadas) === 0) return false
    if (params.resultado === 'com_erros' && n(row.total_erros) === 0) return false
    return !params.q || norm([row.id, row.status, row.observacoes, relation(row.regua)?.nome].join(' ')).includes(norm(params.q))
  })
  const mensagens = rows.reduce((sum: number, row: any) => sum + n(row.total_criadas), 0)
  const pendentes = rows.reduce((sum: number, row: any) => sum + n(row.total_pendentes), 0)
  const erros = rows.reduce((sum: number, row: any) => sum + n(row.total_erros), 0)
  const hasFilters = Boolean(params.q || params.status || params.resultado)

  return <div className="space-y-5">
    <PageHeader eyebrow="Pré-Jurídico" title="Lotes" description="Revise, aprove, envie e acompanhe exclusivamente os lotes e mensagens do fluxo pré-jurídico." />
    <section className="grid gap-3 md:grid-cols-4">
      <Card className="p-4"><Files size={19} className="text-[#04799a]" /><p className="mt-3 text-2xl font-semibold">{rows.length}</p><p className="text-sm text-slate-500">lotes encontrados</p></Card>
      <Card className="p-4"><MessageSquare size={19} className="text-violet-600" /><p className="mt-3 text-2xl font-semibold">{mensagens}</p><p className="text-sm text-slate-500">mensagens preparadas</p></Card>
      <Card className="p-4"><CheckCircle2 size={19} className="text-amber-600" /><p className="mt-3 text-2xl font-semibold">{pendentes}</p><p className="text-sm text-slate-500">pendentes de aprovação</p></Card>
      <Card className="p-4"><AlertCircle size={19} className="text-rose-600" /><p className="mt-3 text-2xl font-semibold">{erros}</p><p className="text-sm text-slate-500">erros para revisar</p></Card>
    </section>
    <ListCollapsibleFilters defaultOpen={hasFilters} actions={<ClearFiltersLink href="/app/pre-juridico/lotes" show={hasFilters} />}>
      <ListFiltersForm className="grid-cols-1 md:grid-cols-2 xl:grid-cols-12">
        <ListSearchField defaultValue={params.q} placeholder="ID, régua ou observação..." className="xl:col-span-6" />
        <ListFilterField label="Status" className="xl:col-span-3"><Select name="status" defaultValue={params.status ?? ''}><option value="">Todos</option><option value="processando">Processando</option><option value="gerado">Gerado</option><option value="pendente_aprovacao">Pendente de aprovação</option><option value="concluido">Concluído</option><option value="concluido_com_falhas">Com falhas</option><option value="erro">Erro</option><option value="cancelado">Cancelado</option></Select></ListFilterField>
        <ListFilterField label="Resultado" className="xl:col-span-2"><Select name="resultado" defaultValue={params.resultado ?? ''}><option value="">Todos</option><option value="com_mensagens">Com mensagens</option><option value="com_duplicadas">Com duplicadas</option><option value="com_erros">Com erros</option></Select></ListFilterField>
        <Button type="submit" className="w-full xl:col-span-1">Filtrar</Button>
      </ListFiltersForm>
    </ListCollapsibleFilters>
    {rows.length ? <Card className="overflow-hidden p-0"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-950">Lotes pré-jurídicos</h2><p className="mt-1 text-sm text-slate-500">Cada linha representa uma geração de documentos e comunicações.</p></div><div className="divide-y divide-slate-100">{rows.map((row: any) => <Link key={row.id} href={`/app/lotes/${row.id}?pre_juridico=1`} className="grid gap-3 px-5 py-4 transition hover:bg-slate-50 lg:grid-cols-[minmax(300px,1fr)_140px_100px_100px_100px_100px] lg:items-center"><div><p className="text-sm font-semibold text-slate-950">Lote {String(row.id).slice(0, 8)}</p><p className="mt-1 text-xs text-slate-500">{relation(row.regua)?.nome || 'Régua pré-jurídica'} · {row.observacoes || 'Geração pré-jurídica'} · {formatDateBR(row.created_at)}</p></div><StatusBadge status={row.status || 'gerado'} /><Metric label="Casos" value={row.total_avaliadas} /><Metric label="Mensagens" value={row.total_criadas} /><Metric label="Duplicadas" value={row.total_duplicadas} /><Metric label="Erros" value={row.total_erros} danger /></Link>)}</div></Card> : <EmptyState title="Nenhum lote pré-jurídico" description="Os lotes criados no processamento pré-jurídico aparecerão aqui." />}
  </div>
}

function Metric({ label, value, danger = false }: { label: string; value: unknown; danger?: boolean }) {
  const total = n(value)
  return <div><p className="text-xs uppercase text-slate-400">{label}</p><p className={`mt-1 text-sm font-semibold ${danger && total ? 'text-rose-700' : 'text-slate-800'}`}>{total}</p></div>
}
