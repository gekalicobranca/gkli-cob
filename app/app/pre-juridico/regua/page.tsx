import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock3, Settings2 } from 'lucide-react'
import { PreJuridicoModuleNav } from '@/components/pre-juridico/module-nav'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/data/status-badge'
import { listCondominios } from '@/features/condominios/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

type Params = Promise<{ q?: string; configuracao?: string }>
const norm = (value: unknown) => String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export default async function ReguaPreJuridicoPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const baseRows = await listCondominios(scope, { status: 'ativo' })
  const termo = norm(params.q)
  const configured = (row: any) => row.dias_expiracao_regua_pre_juridico !== null && row.dias_expiracao_regua_pre_juridico !== undefined
  const rows = baseRows.filter((row: any) => {
    if (params.configuracao === 'ativa' && !configured(row)) return false
    if (params.configuracao === 'pendente' && configured(row)) return false
    return !termo || norm([row.nome_operacional, row.nome, row.administradora, row.carteiras?.nome].join(' ')).includes(termo)
  })
  const ativos = baseRows.filter(configured)
  const pendentes = baseRows.filter((row: any) => !configured(row))
  const media = ativos.length ? Math.round(ativos.reduce((sum: number, row: any) => sum + Number(row.inicio_cobranca_dias ?? 0) + Number(row.dias_expiracao_regua_pre_juridico ?? 0), 0) / ativos.length) : 0

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Pré-Jurídico" title="Régua de encaminhamento" description="Revise quando cada condomínio sai da cobrança extrajudicial e entra na preparação pré-jurídica." />
      <PreJuridicoModuleNav active="regua" />
      <section className="grid gap-3 md:grid-cols-3">
        <Card className="p-4"><CheckCircle2 className="text-emerald-600" size={19} /><p className="mt-3 text-2xl font-semibold">{ativos.length}</p><p className="text-sm text-slate-500">condomínios com expiração configurada</p></Card>
        <Card className="p-4"><AlertTriangle className="text-amber-600" size={19} /><p className="mt-3 text-2xl font-semibold">{pendentes.length}</p><p className="text-sm text-slate-500">sem encaminhamento automático</p></Card>
        <Card className="p-4"><Clock3 className="text-[#04799a]" size={19} /><p className="mt-3 text-2xl font-semibold">D+{media}</p><p className="text-sm text-slate-500">prazo total médio até o pré-jurídico</p></Card>
      </section>
      <Card className="p-4">
        <form className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
          <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Buscar configuração</span><input name="q" defaultValue={params.q ?? ''} placeholder="Condomínio, administradora ou carteira" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Situação</span><select name="configuracao" defaultValue={params.configuracao ?? ''} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Todas</option><option value="ativa">Configurada</option><option value="pendente">Não configurada</option></select></label>
          <button className="h-9 rounded-lg bg-[var(--gkli-primary)] px-4 text-sm font-medium text-white">Filtrar</button>
        </form>
      </Card>
      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-950">Configuração por condomínio</h2><p className="mt-1 text-xs text-slate-500">Prazo total = início da cobrança + dias adicionais até o pré-jurídico.</p></div>
        {rows.length ? <div className="divide-y divide-slate-100">{rows.map((row: any) => {
          const extra = row.dias_expiracao_regua_pre_juridico
          const total = Number(row.inicio_cobranca_dias ?? 0) + Number(extra ?? 0)
          return <div key={row.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(280px,1fr)_150px_170px_160px_auto] lg:items-center">
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-950">{row.nome_operacional || row.nome}</p><p className="mt-1 truncate text-xs text-slate-500">{row.administradora || 'Sem administradora'} · {row.carteiras?.nome || 'Sem carteira'}</p></div>
            <div><p className="text-xs text-slate-400">Início da cobrança</p><p className="mt-1 text-sm font-semibold">D+{Number(row.inicio_cobranca_dias ?? 0)}</p></div>
            <div><p className="text-xs text-slate-400">Expiração adicional</p><p className="mt-1 text-sm font-semibold">{configured(row) ? `${Number(extra)} dias` : 'Não definida'}</p></div>
            <div><p className="text-xs text-slate-400">Entrada prevista</p><div className="mt-1"><StatusBadge status={configured(row) ? `D+${total}` : 'desativado'} /></div></div>
            <Link href={`/app/condominios/${row.id}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"><Settings2 size={14} /> Ajustar</Link>
          </div>
        })}</div> : <div className="p-8 text-center text-sm text-slate-500">Nenhuma configuração encontrada.</div>}
      </Card>
    </div>
  )
}
