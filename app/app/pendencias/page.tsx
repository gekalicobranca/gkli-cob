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
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import {
  ClearFiltersLink,
  ListEmptyState,
  ListFilterField,
  ListFiltersForm,
  ListKpiGrid,
  ListPage,
  ListPanel,
  ListPanelHeader,
  ListRow,
  ListRows,
  ListSearchField,
  ListTitle,
  ListTitleBar,
} from '@/components/layout/list-page'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getPendenciasResumo, listPendenciasOperacionais } from '@/features/pendencias/queries'
import {
  iniciarTratamentoPendencia,
  limparPendenciasEmLote,
  reabrirPendencia,
  resolverPendencia,
  resolverPendenciasEmLote,
} from '@/features/pendencias/actions'
import type { PendenciaOperacional, PendenciaPrioridade, PendenciaStatus } from '@/features/pendencias/types'
import { cn } from '@/lib/utils'
import { PendenciasBulkSelect } from './pendencias-bulk-select'

type SearchParams = Promise<{
  q?: string
  status?: string
  prioridade?: string
  origem?: string
  tipo?: string
  situacao?: string
  data_de?: string
  data_ate?: string
  ordenar?: string
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

const tipoLabel: Record<string, string> = {
  cobranca_aberta_ausente_relatorio: 'Cobrança ausente no relatório',
  emissao_boletos_acordo: 'Emissão de boletos de acordo',
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

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function displayText(value: unknown) {
  return clean(value)
    .replace(/ÃƒÂ§/g, 'ç')
    .replace(/ÃƒÂ£/g, 'ã')
    .replace(/ÃƒÂ¡/g, 'á')
    .replace(/ÃƒÂ©/g, 'é')
    .replace(/ÃƒÂª/g, 'ê')
    .replace(/ÃƒÂ³/g, 'ó')
    .replace(/ÃƒÂº/g, 'ú')
    .replace(/ÃƒÂ­/g, 'í')
    .replace(/ÃƒÂµ/g, 'õ')
    .replace(/Ã§/g, 'ç')
    .replace(/Ã£/g, 'ã')
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ãª/g, 'ê')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã­/g, 'í')
    .replace(/Ãµ/g, 'õ')
}

function formatTipo(tipo: string) {
  return tipoLabel[tipo] ?? displayText(tipo).replace(/_/g, ' ')
}

function normalizeText(value: unknown) {
  return displayText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function dateValue(value: unknown) {
  const text = clean(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
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

function filterPendencias(rows: PendenciaOperacional[], params: Awaited<SearchParams>) {
  const termo = normalizeText(params.q)
  const tipo = clean(params.tipo)
  const situacao = clean(params.situacao)
  const dataDe = dateValue(params.data_de)
  const dataAte = dateValue(params.data_ate)

  return rows.filter((pendencia) => {
    const data = clean(pendencia.created_at).slice(0, 10)
    if (tipo && pendencia.tipo !== tipo) return false
    if (situacao === 'ativas' && ['resolvida', 'cancelada'].includes(pendencia.status)) return false
    if (situacao === 'atrasadas' && !isAtrasada(pendencia)) return false
    if (situacao === 'com_prazo' && !pendencia.prazo_limite) return false
    if (situacao === 'sem_prazo' && pendencia.prazo_limite) return false
    if (situacao === 'sem_responsavel' && clean(pendencia.responsavel_nome)) return false
    if (dataDe && data < dataDe) return false
    if (dataAte && data > dataAte) return false

    if (termo) {
      const haystack = normalizeText([
        pendencia.titulo,
        pendencia.descricao,
        formatTipo(pendencia.tipo),
        pendencia.origem,
        pendencia.responsavel_nome,
        pendencia.status,
        pendencia.prioridade,
        pendencia.entidade_tipo,
        pendencia.entidade_id,
        pendencia.cobranca_id,
        pendencia.acordo_id,
        pendencia.condominio_id,
        pendencia.unidade_id,
        pendencia.administradora_id,
        JSON.stringify(pendencia.payload ?? {}),
      ].filter(Boolean).join(' '))
      if (!haystack.includes(termo)) return false
    }

    return true
  })
}

function sortPendencias(rows: PendenciaOperacional[], ordenar: string) {
  const field = ordenar || 'prazo_asc'
  return [...rows].sort((a, b) => {
    const getValue = (row: PendenciaOperacional) => {
      if (field === 'prazo_asc' || field === 'prazo_desc') return row.prazo_limite ? new Date(row.prazo_limite).getTime() : Number.MAX_SAFE_INTEGER
      if (field === 'created_desc' || field === 'created_asc') return new Date(row.created_at).getTime()
      if (field === 'prioridade') return { critica: 0, alta: 1, normal: 2, baixa: 3 }[row.prioridade] ?? 9
      if (field === 'status') return normalizeText(row.status)
      if (field === 'origem') return normalizeText(row.origem)
      if (field === 'tipo') return normalizeText(row.tipo)
      return row.prazo_limite ? new Date(row.prazo_limite).getTime() : Number.MAX_SAFE_INTEGER
    }
    const av = getValue(a)
    const bv = getValue(b)
    if (typeof av === 'number' && typeof bv === 'number') return field.endsWith('_desc') ? bv - av : av - bv
    return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true })
  })
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
      <div className="flex justify-end">
        <form action={async (formData) => {
          'use server'
          await reabrirPendencia(null, formData)
        }}>
          <input type="hidden" name="id" value={pendencia.id} />
          <PendingSubmitButton
            variant="secondary"
            size="sm"
            className="w-full sm:w-auto"
            icon={<RotateCcw size={14} />}
            pendingLabel="Reabrindo..."
            title="Voltar a pendência para aberta"
          >
            Reabrir
          </PendingSubmitButton>
        </form>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row xl:justify-end">
      {pendencia.status === 'aberta' ? (
        <form action={async (formData) => {
          'use server'
          await iniciarTratamentoPendencia(null, formData)
        }}>
          <input type="hidden" name="id" value={pendencia.id} />
          <PendingSubmitButton
            variant="secondary"
            size="sm"
            className="w-full sm:w-auto"
            icon={<PlayCircle size={14} />}
            pendingLabel="Iniciando..."
            title="Marcar como em tratamento"
          >
            Tratar
          </PendingSubmitButton>
        </form>
      ) : null}
      <form action={async (formData) => {
        'use server'
        await resolverPendencia(null, formData)
      }}>
        <input type="hidden" name="id" value={pendencia.id} />
        <PendingSubmitButton
          variant="primary"
          size="sm"
          className="w-full sm:w-auto"
          icon={<CheckCircle2 size={14} />}
          pendingLabel="Resolvendo..."
          title="Marcar como resolvida"
        >
          Resolver
        </PendingSubmitButton>
      </form>
    </div>
  )
}

function PendenciaRow({ pendencia }: { pendencia: PendenciaOperacional }) {
  const atrasada = isAtrasada(pendencia)
  const title = displayText(pendencia.titulo)
  const description = displayText(pendencia.descricao)
  const responsavel = displayText(pendencia.responsavel_nome) || 'Não definido'
  const tipo = formatTipo(pendencia.tipo)

  return (
    <ListRow className="xl:grid-cols-[32px_minmax(420px,1fr)_170px_210px_180px] xl:items-center">
      <div className="pt-1">
        <input
          form="pendencias-bulk-form"
          data-pendencia-checkbox
          type="checkbox"
          name="pendencia_ids"
          value={pendencia.id}
          aria-label={`Selecionar pendência ${title}`}
          className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]"
        />
      </div>
      <div className="min-w-0">
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
        <h2 className="mt-2 text-base font-semibold tracking-[-0.01em] text-slate-950">{title}</h2>
        {description ? <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">{description}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">{tipo}</span>
          {pendencia.cobranca_id ? <Link href={`/app/cobrancas/${pendencia.cobranca_id}`} className="font-medium text-[var(--gkli-primary)] hover:underline">Ver cobrança</Link> : null}
          {pendencia.acordo_id ? <Link href={`/app/acordos/${pendencia.acordo_id}`} className="font-medium text-[var(--gkli-primary)] hover:underline">Ver acordo</Link> : null}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Prazo</p>
        <p className={cn('mt-1 text-sm', atrasada ? 'font-semibold text-rose-700' : 'text-slate-700')}>{formatDateTime(pendencia.prazo_limite)}</p>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Responsável</p>
        <p className="mt-1 truncate text-sm text-slate-700">{responsavel}</p>
        <p className="mt-1 text-xs text-slate-500">Criada em {formatDateTime(pendencia.created_at)}</p>
      </div>

      <PendenciaActions pendencia={pendencia} />
    </ListRow>
  )
}

export default async function CentralPendenciasPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const hasSituacaoParam = Object.prototype.hasOwnProperty.call(params, 'situacao')
  const situacaoAtual = hasSituacaoParam ? clean(params.situacao) || 'todas' : 'ativas'
  const effectiveParams = { ...params, situacao: situacaoAtual }
  const scope = await getPermittedCarteiras()
  const basePendencias = await listPendenciasOperacionais(scope, effectiveParams)
  const pendencias = sortPendencias(filterPendencias(basePendencias, effectiveParams), clean(params.ordenar) || 'prazo_asc')
  const resumo = getPendenciasResumo(pendencias)
  const statusAtual = params.status ?? 'todos'
  const origemAtual = params.origem ?? 'todos'
  const tipos = Array.from(new Set(basePendencias.map((pendencia) => pendencia.tipo).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const hasFilters = Boolean(params.q || params.status || params.prioridade || params.origem || params.tipo || params.situacao || params.data_de || params.data_ate || params.ordenar)

  return (
    <ListPage>
      <PageHeader
        title="Central de Pendências"
        description="Fila única para acompanhar travas operacionais, solicitações externas, acordos críticos e pontos que exigem ação do time."
      />

      <ListKpiGrid>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Abertas</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950">{resumo.totalAbertas}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Críticas</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-rose-700">{resumo.criticas}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Atrasadas</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-amber-700">{resumo.atrasadas}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">ADM / Acordos</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950">{resumo.administrativas + resumo.acordos}</p>
        </Card>
      </ListKpiGrid>

      <ListPanel>
        <ListPanelHeader>
          <ListTitleBar>
            <ListTitle title="Fila de pendências" />
            <ClearFiltersLink href="/app/pendencias" show={hasFilters} />
          </ListTitleBar>

          <ListFiltersForm className="grid-cols-1 md:grid-cols-2 xl:grid-cols-12">
            <ListSearchField
              defaultValue={clean(params.q)}
              placeholder="Título, tipo, unidade, cobrança, acordo..."
              className="xl:col-span-4"
            />
            <ListFilterField label="Status" className="xl:col-span-2">
              <Select name="status" defaultValue={clean(params.status)}>
                <option value="">Todos</option>
                <option value="aberta">Aberta</option>
                <option value="em_tratamento">Em tratamento</option>
                <option value="resolvida">Resolvida</option>
                <option value="cancelada">Cancelada</option>
              </Select>
            </ListFilterField>
            <ListFilterField label="Prioridade" className="xl:col-span-2">
              <Select name="prioridade" defaultValue={clean(params.prioridade)}>
                <option value="">Todas</option>
                <option value="critica">Crítica</option>
                <option value="alta">Alta</option>
                <option value="normal">Normal</option>
                <option value="baixa">Baixa</option>
              </Select>
            </ListFilterField>
            <ListFilterField label="Origem" className="xl:col-span-2">
              <Select name="origem" defaultValue={clean(params.origem)}>
                <option value="">Todas</option>
                {Object.entries(origemLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </ListFilterField>
            <ListFilterField label="Tipo" className="xl:col-span-2">
              <Select name="tipo" defaultValue={clean(params.tipo)}>
                <option value="">Todos</option>
                {tipos.map((tipo) => <option key={tipo} value={tipo}>{formatTipo(tipo)}</option>)}
              </Select>
            </ListFilterField>
            <ListFilterField label="Situação" className="xl:col-span-2">
              <Select name="situacao" defaultValue={situacaoAtual}>
                <option value="todas">Todas</option>
                <option value="ativas">Ativas</option>
                <option value="atrasadas">Atrasadas</option>
                <option value="com_prazo">Com prazo</option>
                <option value="sem_prazo">Sem prazo</option>
                <option value="sem_responsavel">Sem responsável</option>
              </Select>
            </ListFilterField>
            <ListFilterField label="Data início" className="xl:col-span-2">
              <Input name="data_de" type="date" defaultValue={dateValue(params.data_de)} />
            </ListFilterField>
            <ListFilterField label="Data fim" className="xl:col-span-2">
              <Input name="data_ate" type="date" defaultValue={dateValue(params.data_ate)} />
            </ListFilterField>
            <ListFilterField label="Ordenar por" className="xl:col-span-3">
              <Select name="ordenar" defaultValue={clean(params.ordenar) || 'prazo_asc'}>
                <option value="prazo_asc">Prazo mais próximo</option>
                <option value="prazo_desc">Prazo mais distante</option>
                <option value="created_desc">Mais recentes</option>
                <option value="created_asc">Mais antigas</option>
                <option value="prioridade">Prioridade</option>
                <option value="status">Status</option>
                <option value="origem">Origem</option>
                <option value="tipo">Tipo</option>
              </Select>
            </ListFilterField>
            <Button type="submit" className="w-full xl:col-span-1">
              <Filter size={16} />Filtrar
            </Button>
          </ListFiltersForm>

          <div className="mt-3 flex flex-wrap gap-2">
            <FilterLink href="/app/pendencias?situacao=todas" active={situacaoAtual === 'todas' && statusAtual === 'todos' && origemAtual === 'todos'}>Todas</FilterLink>
            <FilterLink href="/app/pendencias" active={situacaoAtual === 'ativas' && statusAtual === 'todos' && origemAtual === 'todos'}>Ativas</FilterLink>
            <FilterLink href="/app/pendencias?status=aberta" active={statusAtual === 'aberta'}>Abertas</FilterLink>
            <FilterLink href="/app/pendencias?status=em_tratamento" active={statusAtual === 'em_tratamento'}>Em tratamento</FilterLink>
            <FilterLink href="/app/pendencias?prioridade=critica" active={params.prioridade === 'critica'}>Críticas</FilterLink>
            <FilterLink href="/app/pendencias?origem=administradora" active={origemAtual === 'administradora'}>Administradoras</FilterLink>
            <FilterLink href="/app/pendencias?origem=acordo" active={origemAtual === 'acordo'}>Acordos</FilterLink>
            <FilterLink href="/app/pendencias?origem=mensageria" active={origemAtual === 'mensageria'}>Mensageria</FilterLink>
          </div>

          {pendencias.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <PendenciasBulkSelect total={pendencias.length} />
                <span>Selecionar pendências visíveis</span>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">{pendencias.length} na lista</span>
              </div>
              <form id="pendencias-bulk-form" className="flex flex-wrap gap-2">
                <PendingSubmitButton
                  formAction={async (formData) => {
                    'use server'
                    await resolverPendenciasEmLote(formData)
                  }}
                  size="sm"
                  variant="primary"
                  icon={<CheckCircle2 size={14} />}
                  pendingLabel="Resolvendo..."
                >
                  Resolver selecionadas
                </PendingSubmitButton>
                <PendingSubmitButton
                  formAction={async (formData) => {
                    'use server'
                    await limparPendenciasEmLote(formData)
                  }}
                  size="sm"
                  variant="secondary"
                  icon={<Trash2 size={14} />}
                  pendingLabel="Limpando..."
                >
                  Limpar selecionadas
                </PendingSubmitButton>
              </form>
            </div>
          ) : null}
        </ListPanelHeader>

        {pendencias.length > 0 ? (
          <ListRows>
            {pendencias.map((pendencia) => <PendenciaRow key={pendencia.id} pendencia={pendencia} />)}
          </ListRows>
        ) : (
          <ListEmptyState
            title="Nenhuma pendência encontrada"
            description="Quando solicitações ADM, acordos, mensagens ou réguas gerarem travas operacionais, elas aparecerão aqui como fila única de trabalho."
          />
        )}
      </ListPanel>
    </ListPage>
  )
}
