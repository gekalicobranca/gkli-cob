import Link from 'next/link'
import { ArrowUpRight, Download, Edit3, Filter, Home, Plus, Search, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCarteirasForSelect, listCondominiosForSelect } from '@/features/cadastros/queries'
import { updateUnidadesStatusEmLote } from '@/features/unidades/actions'
import { hasUnidadeFilters, listUnidades, normalizeUnidadeFilters } from '@/features/unidades/queries'
import { UnidadesBulkControls } from './unidades-bulk-controls'

type UnidadesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function UnidadesPage({ searchParams }: UnidadesPageProps) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()

  const filters = normalizeUnidadeFilters({
    search: getParam(params?.q),
    carteiraId: getParam(params?.carteira_id),
    condominioId: getParam(params?.condominio_id),
    status: getParam(params?.status),
    contato: getParam(params?.contato),
  })

  const [rows, carteiras, condominios] = await Promise.all([
    listUnidades(scope, filters),
    listCarteirasForSelect(scope),
    listCondominiosForSelect(scope),
  ])

  const filtrosAtivos = hasUnidadeFilters(filters)
  const exportParams = new URLSearchParams()

  if (filters.carteiraId) {
    exportParams.set('carteira_id', filters.carteiraId)
  }

  if (filters.condominioId) {
    exportParams.set('condominio_id', filters.condominioId)
  }

  const exportUnidadesHref = `/api/unidades/exportacoes/unidades${exportParams.toString() ? `?${exportParams.toString()}` : ''}`
  const ativas = rows.filter((row: any) => row.status === 'ativa').length
  const semTelefone = rows.filter((row: any) => !row.telefone).length
  const semEmail = rows.filter((row: any) => !row.email).length

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base Cadastral"
        title="Unidades"
        description="Unidades, responsáveis, contatos e filtros operacionais para cobrança."
        actions={
          <>
            <ButtonLink href={exportUnidadesHref} variant="secondary">
              <Download size={16} />
              Exportar
            </ButtonLink>
            <ButtonLink href="/app/unidades/nova">
              <Plus size={16} />
              Nova unidade
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
            <Home size={18} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Ativas</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{ativas}</p>
          <p className="mt-1 text-sm text-slate-500">unidades no resultado</p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Sem telefone</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{semTelefone}</p>
          <p className="mt-1 text-sm text-slate-500">exigem saneamento</p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Sem e-mail</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{semEmail}</p>
          <p className="mt-1 text-sm text-slate-500">cadastro incompleto</p>
        </Card>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-base font-medium text-slate-950">Base de unidades</h2>
              <p className="mt-1 text-sm text-slate-500">Filtre, consulte e edite o cadastro real da unidade.</p>
            </div>

            {filtrosAtivos ? (
              <ButtonLink href="/app/unidades" variant="secondary" size="sm">
                <X size={15} />
                Limpar filtros
              </ButtonLink>
            ) : null}
          </div>

          <form className="mt-4 grid gap-3 xl:grid-cols-[minmax(220px,1.3fr)_minmax(180px,.85fr)_minmax(220px,1fr)_140px_170px_auto] xl:items-end">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Busca</span>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  name="q"
                  className="pl-9"
                  placeholder="Unidade, condomínio, bloco, responsável, CPF/CNPJ, telefone ou e-mail"
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
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Condomínio</span>
              <Select name="condominio_id" defaultValue={filters.condominioId ?? ''}>
                <option value="">Todos</option>
                {condominios.map((condominio: any) => (
                  <option key={condominio.id} value={condominio.id}>
                    {condominio.nome}
                  </option>
                ))}
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Status</span>
              <Select name="status" defaultValue={filters.status ?? ''}>
                <option value="">Todos</option>
                <option value="ativa">Ativa</option>
                <option value="inativa">Inativa</option>
                <option value="suspensa">Suspensa</option>
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Contato</span>
              <Select name="contato" defaultValue={filters.contato ?? ''}>
                <option value="">Todos</option>
                <option value="sem_telefone">Sem telefone</option>
                <option value="sem_email">Sem e-mail</option>
                <option value="incompleto">Cadastro incompleto</option>
              </Select>
            </label>

            <Button type="submit" className="xl:w-auto">
              <Filter size={16} />
              Filtrar
            </Button>
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Nenhuma unidade encontrada"
              description="Ajuste os filtros ou cadastre/importe unidades para iniciar a operação."
            />
          </div>
        ) : (
          <form action={updateUnidadesStatusEmLote}>
            <UnidadesBulkControls />
            <div className="divide-y divide-slate-100">
              {rows.map((row: any) => (
                <div
                  key={row.id}
                  className="grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[40px_minmax(300px,1.35fr)_120px_170px_220px_170px] xl:items-center"
                >
                  <label className="flex items-center xl:justify-center">
                    <input
                      type="checkbox"
                      name="unidade_ids"
                      value={row.id}
                      aria-label={`Selecionar unidade ${row.identificacao || ''}`}
                      className="size-4 rounded border-slate-300"
                    />
                  </label>

                  <Link href={`/app/unidades/${row.id}`} className="group min-w-0">
                    <p className="truncate text-sm font-medium text-slate-950 group-hover:text-[var(--gkli-primary)]">
                      Unidade {row.identificacao || '-'} {row.bloco ? `· Bloco ${row.bloco}` : ''}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {row.condominios?.nome ?? '-'} · {row.responsavel_nome ?? 'Responsável não informado'} ·{' '}
                      {row.carteiras?.nome ?? '-'}
                    </p>
                  </Link>

                  <StatusBadge status={row.status} />

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Telefone</p>
                    <p className="mt-1 text-sm text-slate-700">{row.telefone ?? '-'}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">E-mail</p>
                    <p className="mt-1 truncate text-sm text-slate-700">{row.email ?? '-'}</p>
                  </div>

                  <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                    <ButtonLink href={`/app/unidades/${row.id}`} variant="secondary" size="sm">
                      <ArrowUpRight size={15} />
                      Abrir
                    </ButtonLink>
                    <ButtonLink href={`/app/unidades/${row.id}#cadastro`} size="sm">
                      <Edit3 size={15} />
                      Editar
                    </ButtonLink>
                  </div>
                </div>
              ))}
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}
