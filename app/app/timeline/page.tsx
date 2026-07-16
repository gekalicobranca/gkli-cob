import Link from 'next/link'
import { Activity, AlertTriangle, ArrowUpRight, Building2, Clock3, FileClock, Handshake, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/data/empty-state'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { formatDateBR } from '@/utils/formatters/date'
import { listTimelineOperacional, normalizeTimelineFilters } from '@/features/timeline/queries'
import type { TimelineOperacionalItem } from '@/features/timeline/types'

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function formatDateTimeBR(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function toneForSeverity(severidade: string) {
  if (severidade === 'critico') return 'red' as const
  if (severidade === 'alerta') return 'yellow' as const
  if (severidade === 'sucesso') return 'green' as const
  return 'blue' as const
}

function labelEntidade(tipo: string) {
  const labels: Record<string, string> = {
    cobranca: 'Cobrança',
    acordo: 'Acordo',
    parcela_acordo: 'Parcela',
    condominio: 'Condomínio',
    unidade: 'Unidade',
    administradora: 'Administradora',
    solicitacao_administradora: 'Solicitação ADM',
    lote: 'Lote',
    lote_mensagem: 'Lote',
    mensagem: 'Mensagem',
    regua: 'Régua',
    importacao: 'Importação',
    operacional: 'Operacional',
  }

  return labels[tipo] ?? tipo.replaceAll('_', ' ')
}

function hrefForEvento(evento: TimelineOperacionalItem) {
  if (evento.acordo_id) return `/app/acordos/${evento.acordo_id}`
  if (evento.cobranca_id) return `/app/cobrancas/${evento.cobranca_id}`
  if (evento.administradora_id) return `/app/administradoras/${evento.administradora_id}`
  if (evento.unidade_id) return `/app/unidades/${evento.unidade_id}`
  if (evento.condominio_id) return `/app/condominios/${evento.condominio_id}`
  if (evento.lote_id) return `/app/lotes/${evento.lote_id}`

  if (evento.entidade_tipo === 'acordo' && evento.entidade_id) return `/app/acordos/${evento.entidade_id}`
  if (evento.entidade_tipo === 'cobranca' && evento.entidade_id) return `/app/cobrancas/${evento.entidade_id}`
  if (evento.entidade_tipo === 'administradora' && evento.entidade_id) return `/app/administradoras/${evento.entidade_id}`
  if (evento.entidade_tipo === 'unidade' && evento.entidade_id) return `/app/unidades/${evento.entidade_id}`
  if (evento.entidade_tipo === 'condominio' && evento.entidade_id) return `/app/condominios/${evento.entidade_id}`

  return null
}

function TimelineEventCard({ evento }: { evento: TimelineOperacionalItem }) {
  const href = hrefForEvento(evento)

  return (
    <div className="relative grid gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 md:grid-cols-[150px_1fr_auto] md:items-start">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{formatDateBR(evento.ocorreu_em)}</p>
        <p className="mt-1 text-sm font-medium text-slate-700">{formatDateTimeBR(evento.ocorreu_em).split(' ')[1] ?? ''}</p>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={toneForSeverity(evento.severidade)}>{evento.severidade}</Badge>
          <Badge tone="primary">{labelEntidade(evento.entidade_tipo)}</Badge>
          <Badge>{evento.evento_tipo}</Badge>
        </div>

        <h3 className="mt-2 text-sm font-semibold text-slate-950">{evento.titulo}</h3>
        {evento.descricao ? <p className="mt-1 text-sm leading-6 text-slate-600">{evento.descricao}</p> : null}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {evento.status_anterior || evento.status_novo ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
              {evento.status_anterior ?? '—'} → {evento.status_novo ?? '—'}
            </span>
          ) : null}
          {evento.usuario_nome || evento.usuario_email ? (
            <span>{evento.usuario_nome ?? evento.usuario_email}</span>
          ) : null}
          <span>origem: {evento.origem}</span>
        </div>
      </div>

      {href ? (
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--gkli-primary)] hover:underline">
          Abrir
          <ArrowUpRight size={14} />
        </Link>
      ) : null}
    </div>
  )
}

export default async function TimelinePage({ searchParams }: PageProps) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const filters = normalizeTimelineFilters(params ?? {})
  const data = await listTimelineOperacional(scope, filters)

  const cards = [
    {
      label: 'Eventos exibidos',
      value: data.metricas.total,
      description: 'na janela filtrada',
      icon: Activity,
    },
    {
      label: 'Alertas',
      value: data.metricas.alertas,
      description: 'exigem acompanhamento',
      icon: AlertTriangle,
    },
    {
      label: 'Acordos',
      value: data.metricas.acordos,
      description: 'eventos de negociação',
      icon: Handshake,
    },
    {
      label: 'Administradoras',
      value: data.metricas.administradoras,
      description: 'operação externa',
      icon: Building2,
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operação"
        title="Timeline operacional global"
        description="Memória viva da operação: cobranças, acordos, mensageria, réguas, lotes e administradoras em uma trilha única."
        actions={
          <ButtonLink href="/app/cockpit" variant="secondary">
            Ir ao cockpit
            <ArrowUpRight size={16} />
          </ButtonLink>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.label} className="relative overflow-hidden p-5">
              <div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
                <Icon size={18} />
              </div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{card.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{card.value}</p>
              <p className="mt-1 text-sm text-slate-500">{card.description}</p>
            </Card>
          )
        })}
      </section>

      <Card className="p-5">
        <form className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5 xl:items-end [&>label]:min-w-0 [&_button]:whitespace-nowrap [&_input]:min-w-0 [&_input]:text-[13px] [&_select]:min-w-0 [&_select]:text-[13px]">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Busca</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <Input name="q" defaultValue={filters.q ?? ''} placeholder="Buscar por título, descrição, tipo..." className="pl-9" />
            </div>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Entidade</span>
            <Select name="entidadeTipo" defaultValue={filters.entidadeTipo ?? ''}>
              <option value="">Todas</option>
              <option value="cobranca">Cobrança</option>
              <option value="acordo">Acordo</option>
              <option value="administradora">Administradora</option>
              <option value="solicitacao_administradora">Solicitação ADM</option>
              <option value="mensagem">Mensagem</option>
              <option value="lote">Lote</option>
              <option value="condominio">Condomínio</option>
              <option value="unidade">Unidade</option>
            </Select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Severidade</span>
            <Select name="severidade" defaultValue={filters.severidade ?? ''}>
              <option value="">Todas</option>
              <option value="info">Info</option>
              <option value="sucesso">Sucesso</option>
              <option value="alerta">Alerta</option>
              <option value="critico">Crítico</option>
            </Select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Período</span>
            <Select name="periodo" defaultValue={filters.periodo ?? '30d'}>
              <option value="7d">7 dias</option>
              <option value="30d">30 dias</option>
              <option value="90d">90 dias</option>
              <option value="todos">Tudo</option>
            </Select>
          </label>

          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--gkli-primary)] px-4 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--gkli-primary-hover)]">
            Filtrar
          </button>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Clock3 size={18} className="text-[var(--gkli-primary)]" />
              <h2 className="text-base font-medium text-slate-950">Eventos recentes</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">Trilha consolidada para auditoria, cockpit e IA operacional.</p>
          </div>
          <Badge tone="primary">{data.eventos.length} registros</Badge>
        </div>

        {data.eventos.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Timeline ainda vazia"
              description="Os eventos aparecerão aqui conforme houver movimentações em cobranças, acordos, mensageria ou administradoras."
            />
          </div>
        ) : (
          <div>
            {data.eventos.map((evento) => (
              <TimelineEventCard key={evento.id} evento={evento} />
            ))}
          </div>
        )}
      </Card>

      <Card className="grid gap-3 border-dashed p-5 md:grid-cols-[auto_1fr] md:items-start">
        <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-3 text-[var(--gkli-primary)]">
          <FileClock size={20} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Próximo encaixe natural</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            A partir desta timeline, a Central de Pendências consegue nascer quase pronta: eventos críticos, solicitações ADM atrasadas,
            parcelas vencidas, lotes travados e mensagens falhadas viram tarefas operacionais priorizadas.
          </p>
        </div>
      </Card>
    </div>
  )
}
