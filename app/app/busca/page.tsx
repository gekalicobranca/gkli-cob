import Link from 'next/link'
import { Search, ArrowUpRight, Building2, Home, Handshake, WalletCards } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/data/status-badge'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { globalSearch } from '@/features/base-cadastral/queries'
import { formatCurrency } from '@/utils/formatters/currency'

type BuscaPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function BuscaGlobalPage({ searchParams }: BuscaPageProps) {
  const params = await searchParams
  const q = getParam(params?.q) ?? ''
  const scope = await getPermittedCarteiras()
  const results = await globalSearch(scope, q)
  const total = results.condominios.length + results.unidades.length + results.cobrancas.length + results.acordos.length

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Busca Global GKLI"
        title="Busca operacional"
        description="Encontre rapidamente condomínios, unidades, cobranças e acordos por nome, documento, telefone, e-mail, competência ou status."
      />

      <Card className="p-5">
        <form className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Buscar</span>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input name="q" className="pl-9" defaultValue={q} placeholder="Condomínio, unidade, CPF/CNPJ, telefone, e-mail, cobrança ou acordo" autoFocus />
            </div>
          </label>
          <Button type="submit"><Search size={16} />Buscar</Button>
        </form>
        <p className="mt-3 text-sm text-slate-500">{q ? `${total} resultado(s) para “${q}”.` : 'Digite pelo menos 2 caracteres para iniciar a busca.'}</p>
      </Card>

      <section className="grid gap-5 xl:grid-cols-2">
        <ResultGroup title="Condomínios" icon={<Building2 size={17} />} empty="Nenhum condomínio encontrado.">
          {results.condominios.map((row: any) => (
            <ResultItem key={row.id} href={`/app/condominios/${row.id}`} title={row.nome || 'Condomínio'} subtitle={`${row.cnpj || '-'} · ${row.administradora || 'sem administradora'} · ${row.carteiras?.nome || '-'}`} status={row.status} />
          ))}
        </ResultGroup>

        <ResultGroup title="Unidades" icon={<Home size={17} />} empty="Nenhuma unidade encontrada.">
          {results.unidades.map((row: any) => (
            <ResultItem key={row.id} href={`/app/unidades/${row.id}`} title={`Unidade ${row.identificacao || '-'} ${row.bloco ? `· Bloco ${row.bloco}` : ''}`} subtitle={`${row.condominios?.nome || '-'} · ${row.responsavel_nome || 'responsável não informado'} · ${row.telefone || row.email || 'sem contato'}`} status={row.status} />
          ))}
        </ResultGroup>

        <ResultGroup title="Cobranças" icon={<WalletCards size={17} />} empty="Nenhuma cobrança encontrada.">
          {results.cobrancas.map((row: any) => (
            <ResultItem key={row.id} href={`/app/cobrancas/${row.id}`} title={`Cobrança ${row.competencia || '-'}`} subtitle={`${row.condominios?.nome || '-'} · Unidade ${row.unidades?.identificacao || '-'} · ${formatCurrency(row.valor_atualizado)}`} status={row.status_financeiro || row.status_operacional} />
          ))}
        </ResultGroup>

        <ResultGroup title="Acordos" icon={<Handshake size={17} />} empty="Nenhum acordo encontrado.">
          {results.acordos.map((row: any) => (
            <ResultItem key={row.id} href={`/app/acordos/${row.id}`} title={`Acordo ${formatDate(row.data_acordo)}`} subtitle={`${row.condominios?.nome || '-'} · Unidade ${row.unidades?.identificacao || '-'} · ${formatCurrency(row.valor_acordado)}`} status={row.status_financeiro || row.status} />
          ))}
        </ResultGroup>
      </section>
    </div>
  )
}

function ResultGroup({ title, icon, empty, children }: { title: string; icon: React.ReactNode; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <span className="rounded-xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">{icon}</span>
        <h2 className="text-base font-medium text-slate-950">{title}</h2>
      </div>
      {hasChildren ? <div className="divide-y divide-slate-100">{children}</div> : <div className="p-5 text-sm text-slate-500">{empty}</div>}
    </Card>
  )
}

function ResultItem({ href, title, subtitle, status }: { href: string; title: string; subtitle: string; status?: string | null }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-950">{title}</p>
        <p className="mt-1 truncate text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {status ? <StatusBadge status={status} /> : null}
        <ArrowUpRight size={15} className="text-slate-400" />
      </div>
    </Link>
  )
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}
