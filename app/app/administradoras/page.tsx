import Link from 'next/link'
import { ArrowUpRight, Building2, Filter, Plus, Search, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listAdministradoras, normalizeAdmFilters } from '@/features/administradoras/queries'

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> }
function getParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value }

export default async function AdministradorasPage({ searchParams }: Props) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const filters = normalizeAdmFilters({ search: getParam(params?.q), status: getParam(params?.status), carteiraId: getParam(params?.carteira_id) })
  const rows = await listAdministradoras(scope, filters)
  const ativas = rows.filter((row) => row.status !== 'inativo').length
  const filtrosAtivos = Boolean(filters.search || filters.status || filters.carteiraId)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administradoras"
        title="Cadastro de administradoras"
        description="Controle as administradoras, seus contatos e a operação externa que destrava planilhas, boletos e registros de acordo."
        actions={<ButtonLink href="/app/administradoras/nova"><Plus size={16} />Nova administradora</ButtonLink>}
      />

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="p-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Total</p><p className="mt-3 text-3xl font-semibold text-slate-950">{rows.length}</p><p className="mt-1 text-sm text-slate-500">administradoras filtradas</p></Card>
        <Card className="p-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Ativas</p><p className="mt-3 text-3xl font-semibold text-slate-950">{ativas}</p><p className="mt-1 text-sm text-slate-500">aptas para operação</p></Card>
        <Card className="p-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Hub externo</p><p className="mt-3 text-3xl font-semibold text-slate-950">ADM</p><p className="mt-1 text-sm text-slate-500">planilhas, boletos e retornos</p></Card>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div><h2 className="text-base font-medium text-slate-950">Base de administradoras</h2><p className="mt-1 text-sm text-slate-500">Busque por nome, CNPJ ou e-mail.</p></div>
            {filtrosAtivos ? <ButtonLink href="/app/administradoras" variant="secondary" size="sm"><X size={15} />Limpar filtros</ButtonLink> : null}
          </div>
          <form className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_auto] md:items-end">
            <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Busca</span><div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input name="q" className="pl-9" defaultValue={filters.search ?? ''} placeholder="Nome, CNPJ ou e-mail" /></div></label>
            <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Status</span><Select name="status" defaultValue={filters.status ?? ''}><option value="">Todos</option><option value="ativo">Ativo</option><option value="inativo">Inativo</option></Select></label>
            <Button type="submit"><Filter size={16} />Filtrar</Button>
          </form>
        </div>

        {rows.length === 0 ? <div className="p-5"><EmptyState title="Nenhuma administradora encontrada" description="Cadastre a primeira administradora para começar a controlar contatos, planilhas e boletos." /></div> : (
          <div className="divide-y divide-slate-100">
            {rows.map((row) => (
              <div key={row.id} className="grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(260px,1.4fr)_150px_minmax(220px,1fr)_150px] xl:items-center">
                <Link href={`/app/administradoras/${row.id}`} className="group min-w-0"><p className="truncate text-sm font-medium text-slate-950 group-hover:text-[var(--gkli-primary)]"><Building2 size={16} className="mr-2 inline text-slate-400" />{row.nome_operacional || row.nome}</p><p className="mt-1 truncate text-xs text-slate-500">Razão: {row.nome} · CNPJ {row.cnpj ?? '-'} · Resp. {row.responsavel_interno ?? '-'}</p></Link>
                <StatusBadge status={row.status ?? 'ativo'} />
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Contato geral</p><p className="mt-1 truncate text-sm text-slate-700">{row.email ?? row.telefone ?? '-'}</p></div>
                <div className="flex justify-start xl:justify-end"><ButtonLink href={`/app/administradoras/${row.id}`} size="sm" variant="secondary"><ArrowUpRight size={15} />Abrir</ButtonLink></div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
