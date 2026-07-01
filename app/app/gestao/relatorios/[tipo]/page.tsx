import Link from 'next/link'
import { ArrowLeft, Filter, Search, X } from 'lucide-react'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCarteirasForSelect } from '@/features/cadastros/queries'
import { getRelatorio } from '@/features/relatorios/queries'
import { getRelatorioCard, relatorioCards } from '@/features/relatorios/catalog'
import type { RelatorioModo, RelatorioTipo } from '@/features/relatorios/types'

export const dynamic = 'force-dynamic'

type RelatorioDetalhePageProps = {
  params: Promise<{ tipo: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function isRelatorioTipo(value: string): value is RelatorioTipo {
  return relatorioCards.some((card) => card.tipo === value)
}

function getModo(value?: string): RelatorioModo {
  return value === 'detalhado' ? 'detalhado' : 'sintetico'
}

function clearHref(tipo: string, modo: RelatorioModo) {
  return `/app/gestao/relatorios/${tipo}?modo=${modo}`
}

function getValorPrincipal(row: any, tipo: RelatorioTipo) {
  if (tipo === 'condominios-acordos') return row.valorAcordado
  if (tipo === 'condominios-cobrancas') return row.valorOriginal
  return 0
}

function valorLabel(tipo: RelatorioTipo) {
  if (tipo === 'condominios-acordos') return 'Valor acordado'
  if (tipo === 'condominios-cobrancas') return 'Valor original'
  return 'Valor'
}

function registrosLabel(tipo: RelatorioTipo) {
  if (tipo === 'condominios-acordos') return 'Acordos'
  if (tipo === 'condominios-cobrancas') return 'Cobranças'
  return 'Registros'
}

export default async function RelatorioDetalhePage({ params, searchParams }: RelatorioDetalhePageProps) {
  const resolvedParams = await params
  const rawTipo = resolvedParams.tipo

  if (!isRelatorioTipo(rawTipo)) notFound()

  const tipo = rawTipo
  const card = getRelatorioCard(tipo)
  const query = await searchParams
  const modo = getModo(getParam(query?.modo))
  const filters = {
    carteiraId: getParam(query?.carteira_id),
    q: getParam(query?.q),
    status: getParam(query?.status),
    orderBy: getParam(query?.orderBy),
    orderDir: getParam(query?.orderDir) === 'desc' ? 'desc' as const : 'asc' as const,
  }

  const scope = await getPermittedCarteiras()
  const [carteiras, relatorio] = await Promise.all([
    listCarteirasForSelect(scope),
    getRelatorio(tipo, scope, filters),
  ])

  const rows = relatorio.rows
  const filtrosAtivos = Boolean(filters.carteiraId || filters.q || filters.status || filters.orderBy || filters.orderDir === 'desc')
  const outroModo: RelatorioModo = modo === 'sintetico' ? 'detalhado' : 'sintetico'
  const Icon = card.icon

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Gestão · Relatórios"
        title={card.title}
        description={modo === 'sintetico' ? `Versão sintética: ${card.sintetico}.` : `Versão detalhada: ${card.detalhado}.`}
        actions={
          <>
            <ButtonLink href="/app/gestao/relatorios" variant="secondary"><ArrowLeft size={16} />Relatórios</ButtonLink>
            <ButtonLink href={`/app/gestao/relatorios/${tipo}?modo=${outroModo}`} variant="secondary">Ver {outroModo === 'sintetico' ? 'lista' : 'ficha'}</ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-4">
        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><Icon size={18} /></div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Grupos</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{relatorio.resumo.grupos}</p>
          <p className="mt-1 text-sm text-slate-500">linhas principais</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Condomínios</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{relatorio.resumo.condominios}</p>
          <p className="mt-1 text-sm text-slate-500">no recorte</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{registrosLabel(tipo)}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{relatorio.resumo.registros}</p>
          <p className="mt-1 text-sm text-slate-500">registros associados</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{valorLabel(tipo)}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{formatCurrency(relatorio.resumo.valor)}</p>
          <p className="mt-1 text-sm text-slate-500">total no relatório</p>
        </Card>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-base font-medium text-slate-950">Filtros e ordenação</h2>
              <p className="mt-1 text-sm text-slate-500">Refine por carteira, status, busca textual e ordem de leitura.</p>
            </div>
            {filtrosAtivos ? (
              <ButtonLink href={clearHref(tipo, modo)} variant="secondary" size="sm"><X size={15} />Limpar filtros</ButtonLink>
            ) : null}
          </div>

          <form className="mt-4 grid gap-3 xl:grid-cols-[minmax(220px,1.4fr)_minmax(180px,.9fr)_150px_180px_150px_auto] xl:items-end">
            <input type="hidden" name="modo" value={modo} />
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Busca</span>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input name="q" className="pl-9" placeholder="Buscar por nome, CNPJ, administradora, responsável..." defaultValue={filters.q ?? ''} />
              </div>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Carteira</span>
              <SearchableSelect
                name="carteira_id"
                options={carteiras.map((carteira: any) => ({ value: carteira.id, label: carteira.nome }))}
                selectedValue={filters.carteiraId ?? ''}
                placeholder="Digite parte da carteira"
              />
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

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Ordenar por</span>
              <Select name="orderBy" defaultValue={filters.orderBy ?? 'titulo'}>
                <option value="titulo">Nome</option>
                <option value="carteira">Carteira</option>
                <option value="administradora">Administradora</option>
                <option value="condominios">Condomínios</option>
                <option value="registros">Registros</option>
                <option value="valor_original">Valor original</option>
                <option value="valor_atualizado">Valor atualizado</option>
                <option value="valor_acordado">Valor acordado</option>
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Direção</span>
              <Select name="orderDir" defaultValue={filters.orderDir}>
                <option value="asc">Ascendente</option>
                <option value="desc">Descendente</option>
              </Select>
            </label>

            <Button type="submit" className="xl:w-auto"><Filter size={16} />Aplicar</Button>
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="p-5"><EmptyState title="Nenhum dado encontrado" description="Ajuste os filtros ou confira se a base possui registros para este relatório." /></div>
        ) : modo === 'sintetico' ? (
          <div className="divide-y divide-slate-100">
            {rows.map((row) => (
              <div key={row.id} className="grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1.5fr)_130px_130px_150px_150px_120px] xl:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-950">{row.titulo}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{row.subtitulo ?? row.carteira ?? row.administradora ?? '-'}</p>
                </div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Condomínios</p><p className="mt-1 text-sm text-slate-700">{row.condominios}</p></div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{registrosLabel(tipo)}</p><p className="mt-1 text-sm text-slate-700">{row.registros}</p></div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{valorLabel(tipo)}</p><p className="mt-1 text-sm font-semibold text-slate-950">{getValorPrincipal(row, tipo) ? formatCurrency(getValorPrincipal(row, tipo)) : '-'}</p></div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Status</p><p className="mt-1 text-sm text-slate-700">{row.ativos || row.statusAberto} ativo/aberto</p></div>
                <div className="flex justify-end"><Link href={`/app/gestao/relatorios/${tipo}?modo=detalhado&q=${encodeURIComponent(row.titulo)}`} className="text-sm font-medium text-[var(--gkli-primary)] hover:underline">Ficha</Link></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 p-5 xl:grid-cols-2">
            {rows.map((row) => (
              <Card key={row.id} className="overflow-hidden p-0">
                <div className="border-b border-slate-100 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-slate-950">{row.titulo}</h2>
                      <p className="mt-1 text-sm text-slate-500">{row.subtitulo ?? row.carteira ?? row.administradora ?? '-'}</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{registrosLabel(tipo)}</p>
                      <p className="mt-1 text-lg font-semibold text-slate-950">{row.registros}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><p className="text-xs text-slate-500">Condomínios</p><p className="mt-1 text-sm font-semibold text-slate-950">{row.condominios}</p></div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><p className="text-xs text-slate-500">{valorLabel(tipo)}</p><p className="mt-1 text-sm font-semibold text-slate-950">{getValorPrincipal(row, tipo) ? formatCurrency(getValorPrincipal(row, tipo)) : '-'}</p></div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><p className="text-xs text-slate-500">Alertas</p><p className="mt-1 text-sm font-semibold text-slate-950">{row.suspensos + row.statusSuspenso}</p></div>
                  </div>
                </div>
                <div className="max-h-[420px] divide-y divide-slate-100 overflow-auto">
                  {row.detalhe.slice(0, 80).map((item) => (
                    <div key={item.id} className="grid gap-3 px-5 py-3 text-sm md:grid-cols-[minmax(180px,1.2fr)_minmax(150px,1fr)_110px_120px] md:items-center">
                      <div className="min-w-0"><p className="truncate font-medium text-slate-950">{item.titulo}</p><p className="mt-1 truncate text-xs text-slate-500">{item.subtitulo ?? item.administradora ?? item.carteira ?? '-'}</p></div>
                      <div className="text-xs text-slate-500">{item.vencimento ? formatDateBR(item.vencimento) : item.administradora ?? item.carteira ?? '-'}</div>
                      <div>{item.status ? <StatusBadge status={item.status} /> : <span className="text-xs text-slate-400">-</span>}</div>
                      <div className="text-right text-sm font-semibold text-slate-950">{item.valor ? formatCurrency(item.valor) : '-'}</div>
                    </div>
                  ))}
                  {row.detalhe.length > 80 ? <p className="px-5 py-3 text-xs text-slate-500">Mostrando 80 de {row.detalhe.length} itens nesta ficha.</p> : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
