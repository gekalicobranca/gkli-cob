import Link from 'next/link'
import { ArrowUpRight, Filter, Home, Plus, Search, Upload } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listUnidades } from '@/features/unidades/queries'

export default async function UnidadesPage() {
  const scope = await getPermittedCarteiras()
  const rows = await listUnidades(scope)

  const ativas = rows.filter((row: any) => row.status === 'ativa').length
  const semTelefone = rows.filter((row: any) => !row.telefone).length
  const semEmail = rows.filter((row: any) => !row.email).length

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base Cadastral"
        title="Unidades"
        description="Unidades, responsáveis e contatos para operação de cobrança."
        actions={
          <>
            <Button variant="secondary"><Filter size={16} />Filtros</Button>
            <ButtonLink href="/app/importacoes/nova" variant="secondary"><Upload size={16} />Importar</ButtonLink>
            <ButtonLink href="/app/unidades/nova"><Plus size={16} />Nova unidade</ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="relative overflow-hidden p-5"><div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><Home size={18} /></div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Ativas</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{ativas}</p><p className="mt-1 text-sm text-slate-500">unidades operacionais</p></Card>
        <Card className="p-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Sem telefone</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{semTelefone}</p><p className="mt-1 text-sm text-slate-500">exigem saneamento</p></Card>
        <Card className="p-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Sem e-mail</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{semEmail}</p><p className="mt-1 text-sm text-slate-500">cadastro incompleto</p></Card>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div><h2 className="text-base font-medium text-slate-950">Base de unidades</h2><p className="mt-1 text-sm text-slate-500">Clique para consultar ou editar os dados da unidade.</p></div>
            <div className="relative md:w-[360px]"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Buscar unidade ou responsável..." /></div>
          </div>
        </div>

        {rows.length === 0 ? <div className="p-5"><EmptyState title="Nenhuma unidade encontrada" description="Cadastre ou importe unidades para iniciar a operação." /></div> : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => (
              <Link key={row.id} href={`/app/unidades/${row.id}`} className="group grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(300px,1.3fr)_140px_180px_220px_80px] xl:items-center">
                <div><p className="text-sm font-medium text-slate-950">Unidade {row.identificacao} {row.bloco ? `· Bloco ${row.bloco}` : ''}</p><p className="mt-1 text-xs text-slate-500">{row.condominios?.nome ?? '-'} · {row.responsavel_nome ?? 'Responsável não informado'}</p></div>
                <StatusBadge status={row.status} />
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Telefone</p><p className="mt-1 text-sm text-slate-700">{row.telefone ?? '-'}</p></div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">E-mail</p><p className="mt-1 truncate text-sm text-slate-700">{row.email ?? '-'}</p></div>
                <div className="flex justify-end"><ArrowUpRight size={16} className="text-slate-400 group-hover:text-[var(--gkli-primary)]" /></div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
