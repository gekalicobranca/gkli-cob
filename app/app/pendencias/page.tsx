import Link from 'next/link'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  Filter,
  Handshake,
  MessageSquareWarning,
  PlayCircle,
  RotateCcw,
  SearchCheck,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listPendenciasOperacionais, getPendenciasResumo } from '@/features/pendencias/queries'
import { iniciarTratamentoPendencia, reabrirPendencia, resolverPendencia } from '@/features/pendencias/actions'
import type { PendenciaOperacional, PendenciaPrioridade, PendenciaStatus } from '@/features/pendencias/types'
import { cn } from '@/lib/utils'

type SearchParams = Promise<{
  status?: string
  prioridade?: string
  origem?: string
}>

const prioridadeLabel: Record<PendenciaPrioridade, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  critica: 'Crítica',
}

const statusLabel: Record<PendenciaStatus, string> = {
  aberta: 'Aberta',
  em_tratamento: 'Em tratamento',
  resolvida: 'Resolvida',
  cancelada: 'Cancelada',
}

const origemLabel: Record<string, string> = {
  administradora: 'Administradora',
  acordo: 'Acordo',
  cobranca: 'Cobrança',
  mensageria: 'Mensageria',
  regua: 'Régua',
  manual: 'Manual',
}

const prioridadeClasses: Record<PendenciaPrioridade, string> = {
  baixa: 'border-slate-200 bg-slate-50 text-slate-600',
  normal: 'border-sky-200 bg-sky-50 text-sky-700',
  alta: 'border-amber-200 bg-amber-50 text-amber-700',
  critica: 'border-rose-200 bg-rose-50 text-rose-700',
}

const statusClasses: Record<PendenciaStatus, string> = {
  aberta: 'border-slate-200 bg-white text-slate-700',
  em_tratamento: 'border-blue-200 bg-blue-50 text-blue-700',
  resolvida: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelada: 'border-slate-200 bg-slate-100 text-slate-500',
}

function isAtrasada(pendencia: PendenciaOperacional) {
  if (!pendencia.prazo_limite) return false
  if (pendencia.status === 'resolvida' || pendencia.status === 'cancelada') return false
  return new Date(pendencia.prazo_limite).getTime() < Date.now()
}

function formatDateTime(value: string | null) {
  if (!value) return 'Sem prazo'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function origemIcon(origem: string) {
  if (origem === 'administradora') return <Building2 size={16} />
  if (origem === 'acordo') return <Handshake size={16} />
  if (origem === 'mensageria' || origem === 'regua') return <MessageSquareWarning size={16} />
  return <SearchCheck size={16} />
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-full border px-3 py-1.5 text-[12px] font-medium transition',
        active
          ? 'border-[#04799a] bg-[#e8f6fb] text-[#03658C]'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950',
      )}
    >
      {children}
    </Link>
  )
}

function PendenciaActions({ pendencia }: { pendencia: PendenciaOperacional }) {
  if (pendencia.status === 'resolvida' || pendencia.status === 'cancelada') {
    return (
      <form action={async (formData) => {
        'use server'
        await reabrirPendencia(null, formData)
      }}>
        <input type="hidden" name="id" value={pendencia.id} />
        <PendingSubmitButton variant="secondary" size="sm" className="w-full sm:w-auto" icon={<RotateCcw size={14} />} pendingLabel="Reabrindo...">
          Reabrir
        </PendingSubmitButton>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {pendencia.status === 'aberta' ? (
        <form action={async (formData) => {
          'use server'
          await iniciarTratamentoPendencia(null, formData)
        }}>
          <input type="hidden" name="id" value={pendencia.id} />
          <PendingSubmitButton variant="secondary" size="sm" className="w-full sm:w-auto" icon={<PlayCircle size={14} />} pendingLabel="Iniciando...">
            Tratar
          </PendingSubmitButton>
        </form>
      ) : null}
      <form action={async (formData) => {
        'use server'
        await resolverPendencia(null, formData)
      }}>
        <input type="hidden" name="id" value={pendencia.id} />
        <PendingSubmitButton variant="primary" size="sm" className="w-full sm:w-auto" icon={<CheckCircle2 size={14} />} pendingLabel="Resolvendo...">
          Resolver
        </PendingSubmitButton>
      </form>
    </div>
  )
}

function PendenciaCard({ pendencia }: { pendencia: PendenciaOperacional }) {
  const atrasada = isAtrasada(pendencia)

  return (
    <Card className="p-0">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium', prioridadeClasses[pendencia.prioridade])}>
              {pendencia.prioridade === 'critica' ? <AlertTriangle size={13} /> : null}
              {prioridadeLabel[pendencia.prioridade] ?? pendencia.prioridade}
            </span>
            <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium', statusClasses[pendencia.status])}>
              {statusLabel[pendencia.status] ?? pendencia.status}
            </span>
            {atrasada ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700">
                <Clock3 size={13} />
                Atrasada
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              {origemIcon(pendencia.origem)}
              {origemLabel[pendencia.origem] ?? pendencia.origem}
            </span>
          </div>

          <h2 className="mt-3 text-base font-semibold tracking-[-0.02em] text-slate-950">
            {pendencia.titulo}
          </h2>
          {pendencia.descricao ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{pendencia.descricao}</p>
          ) : null}

          <div className="mt-4 grid gap-2 text-[12px] text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
            <span>Tipo: <strong className="text-slate-700">{pendencia.tipo}</strong></span>
            <span>Prazo: <strong className={cn(atrasada ? 'text-rose-700' : 'text-slate-700')}>{formatDateTime(pendencia.prazo_limite)}</strong></span>
            <span>Responsável: <strong className="text-slate-700">{pendencia.responsavel_nome ?? 'Não definido'}</strong></span>
            <span>Criada em: <strong className="text-slate-700">{formatDateTime(pendencia.created_at)}</strong></span>
          </div>
        </div>

        <PendenciaActions pendencia={pendencia} />
      </div>
    </Card>
  )
}

export default async function CentralPendenciasPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const pendencias = await listPendenciasOperacionais(scope, params)
  const resumo = getPendenciasResumo(pendencias)

  const statusAtual = params.status ?? 'todos'
  const origemAtual = params.origem ?? 'todos'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Central de Pendências"
        description="Fila única para acompanhar travas operacionais, solicitações externas, acordos críticos e pontos que exigem ação do time."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Abertas</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{resumo.totalAbertas}</p>
          <p className="mt-1 text-sm text-slate-500">pendências ainda em operação</p>
        </Card>
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Críticas</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-rose-700">{resumo.criticas}</p>
          <p className="mt-1 text-sm text-slate-500">alto impacto ou risco imediato</p>
        </Card>
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Atrasadas</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-amber-700">{resumo.atrasadas}</p>
          <p className="mt-1 text-sm text-slate-500">prazo operacional vencido</p>
        </Card>
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">ADM / Acordos</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{resumo.administrativas + resumo.acordos}</p>
          <p className="mt-1 text-sm text-slate-500">dependências externas e financeiras</p>
        </Card>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <Filter size={16} />
          Filtros rápidos
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterLink href="/app/pendencias" active={statusAtual === 'todos' && origemAtual === 'todos'}>Todas</FilterLink>
          <FilterLink href="/app/pendencias?status=aberta" active={statusAtual === 'aberta'}>Abertas</FilterLink>
          <FilterLink href="/app/pendencias?status=em_tratamento" active={statusAtual === 'em_tratamento'}>Em tratamento</FilterLink>
          <FilterLink href="/app/pendencias?prioridade=critica" active={params.prioridade === 'critica'}>Críticas</FilterLink>
          <FilterLink href="/app/pendencias?origem=administradora" active={origemAtual === 'administradora'}>Administradoras</FilterLink>
          <FilterLink href="/app/pendencias?origem=acordo" active={origemAtual === 'acordo'}>Acordos</FilterLink>
          <FilterLink href="/app/pendencias?origem=mensageria" active={origemAtual === 'mensageria'}>Mensageria</FilterLink>
        </div>
      </Card>

      <div className="space-y-3">
        {pendencias.length > 0 ? (
          pendencias.map((pendencia) => <PendenciaCard key={pendencia.id} pendencia={pendencia} />)
        ) : (
          <Card className="py-12 text-center">
            <SearchCheck className="mx-auto text-slate-400" size={34} />
            <h2 className="mt-4 text-lg font-semibold text-slate-950">Nenhuma pendência encontrada</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Quando solicitações ADM, acordos, mensagens ou réguas gerarem travas operacionais, elas aparecerão aqui como fila única de trabalho.
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}
