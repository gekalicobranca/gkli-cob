import Link from 'next/link'
import { AlertCircle, CheckCircle2, Layers3, Scale } from 'lucide-react'
import { PreJuridicoModuleNav } from '@/components/pre-juridico/module-nav'
import { PreJuridicoCasosBoard } from '@/components/pre-juridico/casos-board'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/data/status-badge'
import { listLotesRegua } from '@/features/lotes/queries'
import { listPreJuridicoCasos } from '@/features/pre-juridico/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { formatDateBR } from '@/utils/formatters/date'

type Params = Promise<{ q?: string; status?: string }>
const n = (value: unknown) => Number(value ?? 0) || 0
const norm = (value: unknown) => String(value ?? '').trim().toLowerCase()

export default async function MonitorPreJuridicoPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const [casos, lotes] = await Promise.all([listPreJuridicoCasos(scope), listLotesRegua(scope)])
  const baseRows = lotes.filter((row: any) => row.resumo?.contexto === 'pre_juridico')
  const rows = baseRows.filter((row: any) => (!params.status || row.status === params.status) && (!params.q || norm([row.id, row.status, row.observacoes].join(' ')).includes(norm(params.q))))
  const emPreparacao = casos.filter((caso: any) => ['aguardando_documentos', 'aguardando_administradora', 'aguardando_sindico'].includes(caso.etapa)).length
  const noJuridico = casos.filter((caso: any) => ['enviado_juridico', 'analise_juridica', 'pendencia_juridica', 'autorizado_ajuizamento'].includes(caso.etapa)).length
  const judicializados = casos.filter((caso: any) => caso.etapa === 'judicializado').length
  const falhas = baseRows.reduce((sum: number, row: any) => sum + n(row.total_erros), 0)

  return <div className="space-y-5">
    <PageHeader eyebrow="Pré-Jurídico" title="Monitor de casos" description="Acompanhe a passagem de cada caso pela validação, jurídico, autorização e judicialização." />
    <PreJuridicoModuleNav active="monitor" />
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Card className="p-4"><Layers3 size={19} className="text-[#04799a]" /><p className="mt-3 text-2xl font-semibold">{emPreparacao}</p><p className="text-sm text-slate-500">em preparação e validação</p></Card>
      <Card className="p-4"><Scale size={19} className="text-violet-600" /><p className="mt-3 text-2xl font-semibold">{noJuridico}</p><p className="text-sm text-slate-500">em tratamento pelo jurídico</p></Card>
      <Card className="p-4"><CheckCircle2 size={19} className="text-emerald-600" /><p className="mt-3 text-2xl font-semibold">{judicializados}</p><p className="text-sm text-slate-500">judicializados com processo</p></Card>
      <Card className="p-4"><AlertCircle size={19} className="text-rose-600" /><p className="mt-3 text-2xl font-semibold">{falhas}</p><p className="text-sm text-slate-500">falhas nos lotes de comunicação</p></Card>
    </section>
    <Card className="overflow-hidden p-0"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-950">Fluxo dos casos</h2><p className="mt-1 text-xs text-slate-500">Role horizontalmente para ver todas as etapas. Abra um cartão para atualizar o andamento.</p></div><div className="p-3"><PreJuridicoCasosBoard casos={casos as any[]} /></div></Card>
    <Card className="p-4"><form className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end"><label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Buscar lote</span><input name="q" defaultValue={params.q ?? ''} placeholder="ID, observação ou status" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label><label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Status</span><select name="status" defaultValue={params.status ?? ''} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Todos</option><option value="processando">Processando</option><option value="concluido">Concluído</option><option value="concluido_com_falhas">Com falhas</option><option value="erro">Erro</option></select></label><button className="h-9 rounded-lg bg-[var(--gkli-primary)] px-4 text-sm font-medium text-white">Filtrar lotes</button></form></Card>
    <Card className="overflow-hidden p-0"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-950">Histórico de comunicações</h2><p className="mt-1 text-xs text-slate-500">Lotes que prepararam documentos e mensagens do pré-jurídico.</p></div>{rows.length ? <div className="divide-y divide-slate-100">{rows.map((row: any) => <Link key={row.id} href={`/app/lotes/${row.id}?pre_juridico=1`} className="grid gap-4 px-5 py-4 transition hover:bg-slate-50 lg:grid-cols-[minmax(280px,1fr)_130px_120px_120px_120px] lg:items-center"><div><p className="text-sm font-semibold text-slate-950">Lote {String(row.id).slice(0, 8)}</p><p className="mt-1 text-xs text-slate-500">{row.observacoes || 'Encaminhamento pré-jurídico'} · {formatDateBR(row.created_at)}</p></div><StatusBadge status={row.status || 'gerado'} /><div><p className="text-xs text-slate-400">Casos</p><p className="mt-1 text-sm font-semibold">{n(row.total_avaliadas)}</p></div><div><p className="text-xs text-slate-400">Mensagens</p><p className="mt-1 text-sm font-semibold">{n(row.total_criadas)}</p></div><div><p className="text-xs text-slate-400">Falhas</p><p className={`mt-1 text-sm font-semibold ${n(row.total_erros) ? 'text-rose-700' : 'text-emerald-700'}`}>{n(row.total_erros)}</p></div></Link>)}</div> : <div className="p-8 text-center text-sm text-slate-500">Nenhum lote pré-jurídico encontrado.</div>}</Card>
  </div>
}
