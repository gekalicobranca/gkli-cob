import Link from 'next/link'
import { ArrowUpRight, Building2, Download, Edit3, Filter, Plus, Search, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { formatCurrency } from '@/utils/formatters/currency'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCarteirasForSelect } from '@/features/cadastros/queries'
import { ClassificacaoOperacionalBadge } from '@/features/condominios/components/classificacao-operacional'
import {
  hasCondominioFilters,
  listAdministradorasCondominios,
  listCondominios,
  normalizeCondominioFilters,
} from '@/features/condominios/queries'

type CondominiosPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function CondominiosPage({ searchParams }: CondominiosPageProps) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()

  const filters = normalizeCondominioFilters({
    search: getParam(params?.q),
    carteiraId: getParam(params?.carteira_id),
    administradora: getParam(params?.administradora),
    status: getParam(params?.status),
  })

  const [rows, carteiras, administradoras] = await Promise.all([
    listCondominios(scope, filters),
    listCarteirasForSelect(scope),
    listAdministradorasCondominios(scope),
  ])

  const filtrosAtivos = hasCondominioFilters(filters)
  const exportParams = new URLSearchParams()

  if (filters.carteiraId) {
    exportParams.set('carteira_id', filters.carteiraId)
  }

  const exportCondominiosHref = `/api/condominios/exportacoes/condominios${exportParams.toString() ? `?${exportParams.toString()}` : ''}`
  const ativos = rows.filter((row: any) => row.status === 'ativo').length
  const mediaRegua = rows.length
    ? Math.round(rows.reduce((sum: number, row: any) => sum + Number(row.inicio_cobranca_dias ?? 0), 0) / rows.length)
    : 0
  const ticketMedio = rows.length
    ? rows.reduce((sum: number, row: any) => sum + Number(row.valor_cota_condominial ?? 0), 0) / rows.length
    : 0

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base Cadastral"
        title="Condomínios"
        description="Base de condomínios, filtros operacionais, regras de início de cobrança e vínculo com carteiras."
        actions={
          <>
            <ButtonLink href={exportCondominiosHref} variant="secondary">
              <Download size={16} />
              Exportar
            </ButtonLink>
            <ButtonLink href="/app/condominios/novo">
              <Plus size={16} />
              Novo condomínio
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
            <Building2 size={18} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Ativos</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{ativos}</p>
          <p className="mt-1 text-sm text-slate-500">condomínios no resultado</p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Régua média</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">D+{mediaRegua}</p>
          <p className="mt-1 text-sm text-slate-500">dias para iniciar cobrança</p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Cota média</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{formatCurrency(ticketMedio)}</p>
          <p className="mt-1 text-sm text-slate-500">referência cadastral filtrada</p>
        </Card>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-base font-medium text-slate-950">Base cadastral</h2>
              <p className="mt-1 text-sm text-slate-500">Filtre, consulte e edite o cadastro real do condomínio.</p>
            </div>

            {filtrosAtivos ? (
              <ButtonLink href="/app/condominios" variant="secondary" size="sm">
                <X size={15} />
                Limpar filtros
              </ButtonLink>
            ) : null}
          </div>

          <form className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,1.4fr)_minmax(180px,.9fr)_minmax(180px,.9fr)_150px_auto] lg:items-end">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Busca</span>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  name="q"
                  className="pl-9"
                  placeholder="Nome, nome operacional, CNPJ ou administradora"
                  defaultValue={filters.search ?? ''}
                />
              </div>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Carteira</span>
              <Select name="carteira_id" defaultValue={filters.carteiraId ?? ''}>
                <option value="">Todas</option>
                {carteiras.map((carteira: any) => (
                  <option key={carteira.id} value={carteira.id}>
                    {carteira.nome}
                  </option>
                ))}
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Administradora</span>
              <Select name="administradora" defaultValue={filters.administradora ?? ''}>
                <option value="">Todas</option>
                {administradoras.map((administradora) => (
                  <option key={administradora} value={administradora}>
                    {administradora}
                  </option>
                ))}
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Status</span>
              <Select name="status" defaultValue={filters.status ?? ''}>
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="suspenso">Suspenso</option>
              </Select>
            </label>

            <Button type="submit" className="lg:w-auto">
              <Filter size={16} />
              Filtrar
            </Button>
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Nenhum condomínio encontrado"
              description="Ajuste os filtros ou cadastre/importe condomínios para compor a base cadastral."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => (
              <div
                key={row.id}
                className="grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1.5fr)_110px_140px_130px_160px_170px] xl:items-center"
              >
                <Link href={`/app/condominios/${row.id}`} className="group min-w-0">
                  <p className="truncate text-sm font-medium text-slate-950 group-hover:text-[var(--gkli-primary)]">
                    {row.nome_operacional || row.nome || 'Nome não informado'}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {row.nome_operacional && row.nome_operacional !== row.nome ? `Oficial: ${row.nome} · ` : ''}{row.administradora ?? '-'} · CNPJ {row.cnpj ?? '-'} · {row.carteiras?.nome ?? '-'}
                  </p>
                </Link>

                <ClassificacaoOperacionalBadge value={row.classificacao_operacional} />

                <StatusBadge status={row.status} />

                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Régua</p>
                  <p className="mt-1 text-sm text-slate-700">D+{row.inicio_cobranca_dias}</p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Cota</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    {formatCurrency(Number(row.valor_cota_condominial ?? 0))}
                  </p>
                </div>

                <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                  <ButtonLink href={`/app/condominios/${row.id}`} variant="secondary" size="sm">
                    <ArrowUpRight size={15} />
                    Abrir
                  </ButtonLink>
                  <ButtonLink href={`/app/condominios/${row.id}#cadastro`} size="sm">
                    <Edit3 size={15} />
                    Editar
                  </ButtonLink>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}