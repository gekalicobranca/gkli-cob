import { AlertTriangle, CheckCircle2, Search, ShieldCheck, UserRound, UsersRound } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  LiteKpiStrip,
  LitePageHeader,
  LitePageShell,
  LiteScrollArea,
  LiteWorkArea,
} from '@/components/layout/lite-page-shell'
import { EmptyState } from '@/components/data/empty-state'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import {
  getSaneamentoCobrancasResumo,
  listCarteirasParaSaneamento,
  listCondominiosParaSaneamento,
  listSaneamentoCobrancas,
} from '@/features/saneamento-cobrancas/queries'
import {
  atualizarResponsavelPeloSaneamento,
  atualizarResponsaveisEmLote,
  confirmarUnidadeSugerida,
  ignorarSaneamentoCobranca,
  ignorarSaneamentosEmLote,
  marcarSaneamentoResolvido,
} from '@/features/saneamento-cobrancas/actions'

type PageProps = {
  searchParams?: Promise<{
    carteira_id?: string
    condominio_id?: string
    tipo?: string
    status?: string
    q?: string
    order_by?: string
  }>
}

const TIPO_LABEL: Record<string, string> = {
  responsavel_divergente: 'Responsável divergente',
  responsavel_ausente: 'Responsável ausente',
  unidade_nao_encontrada: 'Unidade não encontrada',
  possivel_correspondencia: 'Possível correspondência',
}

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  resolvido: 'Resolvido',
  ignorado: 'Ignorado',
}

function clean(value?: string) {
  return String(value ?? '').trim()
}

function tipoTone(tipo: string) {
  if (tipo === 'responsavel_divergente') return 'bg-amber-50 text-amber-700'
  if (tipo === 'responsavel_ausente') return 'bg-blue-50 text-blue-700'
  if (tipo === 'unidade_nao_encontrada') return 'bg-rose-50 text-rose-700'
  return 'bg-violet-50 text-violet-700'
}

function statusTone(status: string) {
  if (status === 'resolvido') return 'bg-emerald-50 text-emerald-700'
  if (status === 'ignorado') return 'bg-slate-100 text-slate-600'
  return 'bg-amber-50 text-amber-700'
}

function displayUnidade(bloco?: string | null, unidade?: string | null) {
  return [bloco, unidade].filter(Boolean).join('/') || '-'
}

export default async function SaneamentoCobrancasPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {}
  const filters = {
    carteiraId: clean(params.carteira_id),
    condominioId: clean(params.condominio_id),
    tipo: clean(params.tipo),
    status: clean(params.status) || 'pendente',
    q: clean(params.q),
    orderBy: clean(params.order_by) || 'operacional',
  }

  const hasFilters = Boolean(
    filters.carteiraId ||
      filters.condominioId ||
      filters.tipo ||
      (filters.status && filters.status !== 'pendente') ||
      filters.q ||
      (filters.orderBy && filters.orderBy !== 'operacional'),
  )

  const scope = await getPermittedCarteiras()

  let rows: any[] = []
  let resumo = {
    total: 0,
    responsavelDivergente: 0,
    responsavelAusente: 0,
    unidadeNaoEncontrada: 0,
    possivelCorrespondencia: 0,
  }
  let carteiras: Array<{ id: string; nome: string }> = []
  let condominios: Array<{ id: string; nome: string; carteira_id: string }> = []
  let loadError: string | null = null

  try {
    ;[rows, resumo, carteiras, condominios] = await Promise.all([
      listSaneamentoCobrancas(scope, filters),
      getSaneamentoCobrancasResumo(scope),
      listCarteirasParaSaneamento(scope),
      listCondominiosParaSaneamento(scope, filters.carteiraId),
    ])
  } catch (error) {
    console.error('[saneamento-cobrancas] erro ao carregar página', error)
    loadError = error instanceof Error ? error.message : 'Erro inesperado ao carregar saneamento de cobranças.'

    try {
      ;[carteiras, condominios] = await Promise.all([
        listCarteirasParaSaneamento(scope).catch(() => []),
        listCondominiosParaSaneamento(scope, filters.carteiraId).catch(() => []),
      ])
    } catch {
      carteiras = []
      condominios = []
    }
  }

  return (
    <LitePageShell>
      <LitePageHeader>
        <PageHeader
          eyebrow="Gestão"
          title="Saneamento de cobranças"
          description="Mesa de limpeza cadastral para divergências geradas na importação de inadimplência. A cobrança entra; a gestão corrige o cadastro depois."
          actions={
            <ButtonLink href="/app/cobrancas" variant="secondary">
              Voltar para cobranças
            </ButtonLink>
          }
        />
      </LitePageHeader>

      <LiteKpiStrip className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: 'Responsável divergente',
            value: resumo.responsavelDivergente,
            icon: <UsersRound size={18} />,
            tone: 'bg-amber-50 text-amber-700',
          },
          {
            title: 'Responsável ausente',
            value: resumo.responsavelAusente,
            icon: <UserRound size={18} />,
            tone: 'bg-blue-50 text-blue-700',
          },
          {
            title: 'Unidade não encontrada',
            value: resumo.unidadeNaoEncontrada,
            icon: <AlertTriangle size={18} />,
            tone: 'bg-rose-50 text-rose-700',
          },
          {
            title: 'Possível correspondência',
            value: resumo.possivelCorrespondencia,
            icon: <ShieldCheck size={18} />,
            tone: 'bg-violet-50 text-violet-700',
          },
        ].map((item) => (
          <Card key={item.title} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                  {item.title}
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                  {item.value}
                </p>
              </div>
              <div className={`rounded-2xl p-2 ${item.tone}`}>{item.icon}</div>
            </div>
            <p className="mt-1 text-sm text-slate-500">pendências em aberto</p>
          </Card>
        ))}
      </LiteKpiStrip>

      {loadError ? (
        <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Não foi possível carregar os dados de saneamento. Detalhe técnico: {loadError}
        </Card>
      ) : null}

      <LiteWorkArea>
        <Card className="flex h-full min-h-0 flex-col overflow-hidden p-0">
          <div className="border-b border-slate-100 bg-white/80 px-5 py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-base font-medium text-slate-950">
                    Pendências cadastrais da importação
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Filtre por carteira, condomínio, tipo e resolva em lote quando o relatório estiver mais atualizado que o cadastro.
                  </p>
                </div>

                {hasFilters ? (
                  <ButtonLink href="/app/gestao/saneamento-cobrancas" variant="secondary">
                    Limpar filtros
                  </ButtonLink>
                ) : null}
              </div>

              <form className="grid gap-2 xl:grid-cols-[minmax(200px,1fr)_180px_220px_210px_160px_170px_110px]">
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    name="q"
                    defaultValue={filters.q}
                    className="pl-9"
                    placeholder="Buscar unidade, responsável..."
                  />
                </div>

                <Select name="carteira_id" defaultValue={filters.carteiraId}>
                  <option value="">Todas as carteiras</option>
                  {carteiras.map((carteira) => (
                    <option key={carteira.id} value={carteira.id}>
                      {carteira.nome}
                    </option>
                  ))}
                </Select>

                <Select name="condominio_id" defaultValue={filters.condominioId}>
                  <option value="">Todos os condomínios</option>
                  {condominios.map((condominio) => (
                    <option key={condominio.id} value={condominio.id}>
                      {condominio.nome}
                    </option>
                  ))}
                </Select>

                <Select name="tipo" defaultValue={filters.tipo}>
                  <option value="">Todos os tipos</option>
                  {Object.entries(TIPO_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>

                <Select name="status" defaultValue={filters.status}>
                  {Object.entries(STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>

                <Select name="order_by" defaultValue={filters.orderBy}>
                  <option value="operacional">Condomínio → Unidade</option>
                  <option value="responsavel">Responsável</option>
                  <option value="created_at_desc">Mais recentes</option>
                </Select>

                <Button type="submit" variant="secondary">
                  Filtrar
                </Button>
              </form>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nenhuma pendência encontrada"
                description="As importações ainda não geraram saneamentos ou os filtros atuais não retornaram registros."
              />
            </div>
          ) : (
            <form className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3 xl:flex-row xl:items-center xl:justify-between">
                <p className="text-sm text-slate-600">
                  {rows.length} pendência(s) carregada(s). Selecione registros para ações em lote.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button formAction={atualizarResponsaveisEmLote} variant="secondary" size="sm">
                    Atualizar responsáveis selecionados
                  </Button>
                  <Button formAction={ignorarSaneamentosEmLote} variant="ghost" size="sm">
                    Ignorar selecionados
                  </Button>
                </div>
              </div>

              <LiteScrollArea className="divide-y divide-slate-100">
                {rows.map((row: any) => {
                  const unidadeCadastro = displayUnidade(row.bloco_cadastro ?? row.unidade?.bloco, row.unidade_cadastro ?? row.unidade?.identificacao)
                  const unidadeRelatorio = displayUnidade(row.bloco_relatorio, row.unidade_relatorio)
                  const podeAtualizarResponsavel =
                    row.status === 'pendente' &&
                    row.unidade_id &&
                    row.responsavel_relatorio &&
                    ['responsavel_divergente', 'responsavel_ausente'].includes(row.tipo)
                  const podeConfirmarSugestao =
                    row.status === 'pendente' && row.tipo === 'possivel_correspondencia' && row.unidade_sugerida_id

                  return (
                    <div
                      key={row.id}
                      className="grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[36px_minmax(240px,1fr)_minmax(190px,0.8fr)_minmax(220px,1fr)_minmax(220px,1fr)_220px] xl:items-center"
                    >
                      <div>
                        <input
                          type="checkbox"
                          name="saneamento_ids"
                          value={row.id}
                          className="size-4 rounded border-slate-300"
                          aria-label={`Selecionar pendência ${row.id}`}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tipoTone(row.tipo)}`}>
                            {TIPO_LABEL[row.tipo] ?? row.tipo}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(row.status)}`}>
                            {STATUS_LABEL[row.status] ?? row.status}
                          </span>
                        </div>
                        <p className="mt-2 truncate text-sm font-medium text-slate-950">
                          {row.condominios?.nome ?? 'Condomínio não informado'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Gerado em {formatDateBR(row.created_at)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                          Unidade
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">
                          {unidadeRelatorio}
                        </p>
                        {row.unidade_sugerida ? (
                          <p className="mt-1 text-xs text-violet-700">
                            Sugestão: {displayUnidade(row.unidade_sugerida.bloco, row.unidade_sugerida.identificacao)}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-slate-500">Cadastro: {unidadeCadastro}</p>
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                          Cadastro GKLI
                        </p>
                        <p className="mt-1 text-sm text-slate-800">
                          {row.responsavel_cadastro || row.unidade?.responsavel_nome || 'Sem responsável'}
                        </p>
                        {row.responsavel_documento_cadastro ? (
                          <p className="mt-1 text-xs text-slate-500">Doc. {row.responsavel_documento_cadastro}</p>
                        ) : null}
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                          Relatório
                        </p>
                        <p className="mt-1 text-sm text-slate-800">
                          {row.responsavel_relatorio || 'Não informado'}
                        </p>
                        {row.responsavel_documento_relatorio ? (
                          <p className="mt-1 text-xs text-slate-500">Doc. {row.responsavel_documento_relatorio}</p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                        {podeAtualizarResponsavel ? (
                          <Button
                            formAction={atualizarResponsavelPeloSaneamento}
                            name="saneamento_id"
                            value={row.id}
                            size="sm"
                            variant="primary"
                          >
                            Atualizar
                          </Button>
                        ) : null}

                        {podeConfirmarSugestao ? (
                          <Button
                            formAction={confirmarUnidadeSugerida}
                            name="saneamento_id"
                            value={row.id}
                            size="sm"
                            variant="primary"
                          >
                            Confirmar vínculo
                          </Button>
                        ) : null}

                        {row.status === 'pendente' ? (
                          <Button
                            formAction={marcarSaneamentoResolvido}
                            name="saneamento_id"
                            value={row.id}
                            size="sm"
                            variant="secondary"
                          >
                            Resolver
                          </Button>
                        ) : null}

                        {row.status === 'pendente' ? (
                          <Button
                            formAction={ignorarSaneamentoCobranca}
                            name="saneamento_id"
                            value={row.id}
                            size="sm"
                            variant="ghost"
                          >
                            Ignorar
                          </Button>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                            <CheckCircle2 size={14} />
                            Finalizado
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </LiteScrollArea>
            </form>
          )}
        </Card>
      </LiteWorkArea>
    </LitePageShell>
  )
}
