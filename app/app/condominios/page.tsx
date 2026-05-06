import Link from 'next/link'
import { ArrowUpRight, Building2, Filter, Plus, Search, Upload } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { formatCurrency } from '@/utils/formatters/currency'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCondominios } from '@/features/condominios/queries'

export default async function CondominiosPage() {
  const scope = await getPermittedCarteiras()
  const rows = await listCondominios(scope)

  const ativos = rows.filter((row: any) => row.status === 'ativo').length
  const mediaRegua = rows.length ? Math.round(rows.reduce((sum: number, row: any) => sum + Number(row.inicio_cobranca_dias ?? 0), 0) / rows.length) : 0
  const ticketMedio = rows.length ? rows.reduce((sum: number, row: any) => sum + Number(row.valor_cota_condominial ?? 0), 0) / rows.length : 0

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base Cadastral"
        title="Condomínios"
        description="Base de condomínios, regras de início de cobrança e vínculo com carteiras."
        actions={
          <>
            <Button variant="secondary"><Filter size={16} />Filtros</Button>
            <ButtonLink href="/app/importacoes/nova" variant="secondary"><Upload size={16} />Importar</ButtonLink>
            <ButtonLink href="/app/condominios/novo"><Plus size={16} />Novo condomínio</ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="relative overflow-hidden p-5"><div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><Building2 size={18} /></div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Ativos</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{ativos}</p><p className="mt-1 text-sm text-slate-500">condomínios operacionais</p></Card>
        <Card className="p-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Régua média</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">D+{mediaRegua}</p><p className="mt-1 text-sm text-slate-500">dias para iniciar cobrança</p></Card>
        <Card className="p-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Cota média</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{formatCurrency(ticketMedio)}</p><p className="mt-1 text-sm text-slate-500">referência cadastral</p></Card>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div><h2 className="text-base font-medium text-slate-950">Base cadastral</h2><p className="mt-1 text-sm text-slate-500">Clique para consultar ou editar o condomínio.</p></div>
            <div className="relative md:w-[360px]"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Buscar condomínio..." /></div>
          </div>
        </div>
        {rows.length === 0 ? <div className="p-5"><EmptyState title="Nenhum condomínio encontrado" description="Cadastre ou importe condomínios para compor a base cadastral." /></div> : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => (
              <Link key={row.id} href={`/app/condominios/${row.id}`} className="group grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1.5fr)_140px_130px_160px_80px] xl:items-center">
                <div><p className="text-sm font-medium text-slate-950">{row.nome}</p><p className="mt-1 text-xs text-slate-500">{row.administradora ?? '-'} · CNPJ {row.cnpj ?? '-'} · {row.carteiras?.nome ?? '-'}</p></div>
                <StatusBadge status={row.status} />
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Régua</p><p className="mt-1 text-sm text-slate-700">D+{row.inicio_cobranca_dias}</p></div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Cota</p><p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_cota_condominial))}</p></div>
                <div className="flex justify-end"><ArrowUpRight size={16} className="text-slate-400 group-hover:text-[var(--gkli-primary)]" /></div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
