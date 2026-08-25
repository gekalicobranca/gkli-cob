import { Activity, Bot, Clock3, Play, Power, PowerOff, RotateCw, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import {
  getAgenteWorkerStatuses,
  listAgenteExecucoesMonitor,
  listAgenteReceitas,
} from '@/features/agente-automatico/queries'
import {
  executarAgenteScriptAgora,
  iniciarAgenteWorkerLocal,
  pararAgenteWorkerLocal,
} from '@/features/agente-automatico/actions'
import { AGENTE_WORKERS } from '@/features/agente-automatico/workers'
import {
  listLocalWorkerProcessStatuses,
  localWorkerControlAvailable,
} from '@/features/agente-automatico/local-workers'

export const dynamic = 'force-dynamic'

const ONLINE_MS = 45_000

type ExecucaoMonitor = {
  id: string
  status: string
  iniciado_em: string | null
  finalizado_em: string | null
  erro_mensagem: string | null
  tentativas: number | null
  origem: string | null
  created_at: string
  receita?: {
    nome: string
    script_key: string | null
    config_json?: Record<string, any> | null
  } | null
  condominio?: {
    nome: string | null
    nome_operacional: string | null
  } | null
}

function formatarData(value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

function tempoRelativo(value: string | null | undefined) {
  if (!value) return 'sem sinal'
  const diffMs = Date.now() - new Date(value).getTime()
  if (diffMs < 0) return 'agora'
  const minutos = Math.floor(diffMs / 60_000)
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `${minutos} min atrás`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `${horas} h atrás`
  return `${Math.floor(horas / 24)} d atrás`
}

function contarPorStatus(execucoes: ExecucaoMonitor[], status: string) {
  return execucoes.filter((execucao) => execucao.status === status).length
}

function resumirErro(value: string | null | undefined) {
  return value?.split('\n')[0]?.trim() || ''
}

function nomeExecucao(execucao: ExecucaoMonitor | undefined) {
  if (!execucao) return 'Sem execução recente'
  return execucao.condominio?.nome_operacional || execucao.condominio?.nome || execucao.receita?.nome || 'Execução sem identificação'
}

function primeiraRelacao<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function getEstadoWorker({
  localAtivo,
  heartbeatOnline,
}: {
  localAtivo: boolean
  heartbeatOnline: boolean
}) {
  if (localAtivo) return { label: 'Processo ativo', tone: 'green' as const }
  if (heartbeatOnline) return { label: 'Sinal recente', tone: 'blue' as const }
  return { label: 'Parado', tone: 'slate' as const }
}

export default async function AgenteAutomaticoMonitorPage() {
  const scope = await getPermittedCarteiras()
  const scriptKeys = AGENTE_WORKERS.map((worker) => worker.scriptKey)
  const [receitas, execucoesRaw, workerStatuses, localStatuses] = await Promise.all([
    listAgenteReceitas(scope.carteiraIds),
    listAgenteExecucoesMonitor(scope.carteiraIds, scriptKeys),
    getAgenteWorkerStatuses(scriptKeys),
    listLocalWorkerProcessStatuses(),
  ])

  const execucoes = (execucoesRaw as unknown as Array<ExecucaoMonitor & {
    receita?: ExecucaoMonitor['receita'] | ExecucaoMonitor['receita'][]
    condominio?: ExecucaoMonitor['condominio'] | ExecucaoMonitor['condominio'][]
  }>).map((execucao) => ({
    ...execucao,
    receita: primeiraRelacao(execucao.receita),
    condominio: primeiraRelacao(execucao.condominio),
  }))
  const controleLocalDisponivel = localWorkerControlAvailable()

  const linhas = AGENTE_WORKERS.map((worker) => {
    const receitasDoWorker = receitas.filter((receita) => receita.script_key === worker.scriptKey && receita.ativo)
    const execucoesDoWorker = execucoes.filter((execucao) => execucao.receita?.script_key === worker.scriptKey)
    const workerStatus = workerStatuses.find((status) => status.script_key === worker.scriptKey)
    const localStatus = localStatuses.find((status) => status.scriptKey === worker.scriptKey)
    const localAtivo = Boolean(localStatus?.pids.length)
    const ultimoSinalEm = workerStatus?.ultimo_sinal_em ?? null
    const heartbeatOnline = Boolean(ultimoSinalEm && Date.now() - new Date(ultimoSinalEm).getTime() < ONLINE_MS)
    const estado = getEstadoWorker({ localAtivo, heartbeatOnline })
    const ultimaExecucao = execucoesDoWorker[0]
    const ultimoErro = execucoesDoWorker.find((execucao) => ['falha', 'precisa_intervencao'].includes(execucao.status))

    return {
      ...worker,
      receitasAtivas: receitasDoWorker.length,
      execucoes: execucoesDoWorker,
      pendentes: contarPorStatus(execucoesDoWorker, 'pendente'),
      emExecucao: contarPorStatus(execucoesDoWorker, 'em_execucao'),
      sucesso: contarPorStatus(execucoesDoWorker, 'sucesso'),
      atencao: contarPorStatus(execucoesDoWorker, 'precisa_intervencao'),
      falha: contarPorStatus(execucoesDoWorker, 'falha'),
      localAtivo,
      localDisponivel: Boolean(localStatus?.disponivel),
      pids: localStatus?.pids ?? [],
      ultimoSinalEm,
      heartbeatOnline,
      estado,
      ultimaExecucao,
      ultimoErro,
    }
  })

  const workersAtivos = linhas.filter((linha) => linha.localAtivo || linha.heartbeatOnline).length
  const filaTotal = linhas.reduce((total, linha) => total + linha.pendentes, 0)
  const emExecucaoTotal = linhas.reduce((total, linha) => total + linha.emExecucao, 0)
  const atencaoTotal = linhas.reduce((total, linha) => total + linha.atencao + linha.falha, 0)

  return (
    <main className="space-y-4">
      <PageHeader
        eyebrow="Automação"
        title="Monitor de agentes"
        description="Tela simples para acompanhar, ligar, parar e acionar os workers de captação."
        actions={(
          <>
            <ButtonLink href="/app/agente-automatico" variant="header">
              Painel avançado
            </ButtonLink>
            <ButtonLink href="/app/agente-automatico/monitor" variant="header">
              <RotateCw size={16} />
              Atualizar
            </ButtonLink>
          </>
        )}
      />

      {!controleLocalDisponivel ? (
        <Card className="border-amber-200 bg-amber-50 text-sm text-amber-800">
          Esta tela está fora do ambiente local dos workers. O monitoramento via banco continua funcionando, mas iniciar/parar processo só fica habilitado quando o app roda no Windows onde os workers executam.
        </Card>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-normal text-slate-400">Workers ativos</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{workersAtivos}/{linhas.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-normal text-slate-400">Na fila</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{filaTotal}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-normal text-slate-400">Em execução</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{emExecucaoTotal}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-normal text-slate-400">Atenção/erro</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{atencaoTotal}</p>
        </Card>
      </section>

      <section className="space-y-3">
        {linhas.map((linha) => (
          <Card key={linha.scriptKey} className="p-0">
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(240px,1.25fr)_minmax(360px,2fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--gkli-primary-soft)] text-[var(--gkli-primary)]">
                    <Bot size={18} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-slate-950">{linha.nome}</h2>
                    <p className="truncate text-xs text-slate-500">{linha.scriptKey}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge tone={linha.estado.tone}>{linha.estado.label}</Badge>
                  <Badge tone="slate">{linha.receitasAtivas} receita(s)</Badge>
                  {linha.pids.length ? <Badge tone="green">PID {linha.pids.join(', ')}</Badge> : null}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div className="min-w-0 rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Clock3 size={14} />
                    <span>Último sinal: {tempoRelativo(linha.ultimoSinalEm)}</span>
                    <span>·</span>
                    <span>{formatarData(linha.ultimoSinalEm)}</span>
                  </div>
                  <p className="mt-2 truncate text-sm font-medium text-slate-950">
                    {nomeExecucao(linha.ultimaExecucao)}
                  </p>
                  {linha.ultimaExecucao ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={linha.ultimaExecucao.status} />
                      <span className="text-xs text-slate-500">{formatarData(linha.ultimaExecucao.created_at)}</span>
                    </div>
                  ) : null}
                  {linha.ultimoErro?.erro_mensagem ? (
                    <p className="mt-2 line-clamp-2 text-xs text-rose-700">
                      {resumirErro(linha.ultimoErro.erro_mensagem)}
                    </p>
                  ) : null}
                </div>

                <div className="grid min-w-[220px] grid-cols-5 gap-1 text-center">
                  <div className="rounded-xl bg-slate-50 px-2 py-2">
                    <p className="text-[10px] uppercase text-slate-400">Fila</p>
                    <p className="text-sm font-semibold text-slate-950">{linha.pendentes}</p>
                  </div>
                  <div className="rounded-xl bg-blue-50 px-2 py-2">
                    <p className="text-[10px] uppercase text-blue-500">Exec.</p>
                    <p className="text-sm font-semibold text-blue-700">{linha.emExecucao}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 px-2 py-2">
                    <p className="text-[10px] uppercase text-emerald-500">Ok</p>
                    <p className="text-sm font-semibold text-emerald-700">{linha.sucesso}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 px-2 py-2">
                    <p className="text-[10px] uppercase text-amber-500">Ação</p>
                    <p className="text-sm font-semibold text-amber-700">{linha.atencao}</p>
                  </div>
                  <div className="rounded-xl bg-rose-50 px-2 py-2">
                    <p className="text-[10px] uppercase text-rose-500">Erro</p>
                    <p className="text-sm font-semibold text-rose-700">{linha.falha}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                <form action={executarAgenteScriptAgora}>
                  <input type="hidden" name="script_key" value={linha.scriptKey} />
                  <Button type="submit" variant="secondary">
                    <Play size={15} />
                    Rodar agora
                  </Button>
                </form>
                <form action={iniciarAgenteWorkerLocal}>
                  <input type="hidden" name="script_key" value={linha.scriptKey} />
                  <Button type="submit" disabled={!linha.localDisponivel || linha.localAtivo}>
                    <Power size={15} />
                    Iniciar
                  </Button>
                </form>
                <form action={pararAgenteWorkerLocal}>
                  <input type="hidden" name="script_key" value={linha.scriptKey} />
                  <Button type="submit" variant="danger" disabled={!linha.localDisponivel || !linha.localAtivo}>
                    <PowerOff size={15} />
                    Parar
                  </Button>
                </form>
              </div>
            </div>
          </Card>
        ))}
      </section>

      <Card className="flex items-start gap-3 bg-slate-50 text-sm text-slate-600">
        <Activity size={18} className="mt-0.5 text-[var(--gkli-primary)]" />
        <div>
          <p className="font-medium text-slate-900">Leitura rápida</p>
          <p className="mt-1">
            “Iniciar” liga o processo do worker. “Rodar agora” cria a fila para todas as receitas ativas daquele worker, sem duplicar receitas já pendentes ou em execução.
          </p>
        </div>
      </Card>

      {atencaoTotal > 0 ? (
        <Card className="flex items-start gap-3 border-amber-200 bg-amber-50 text-sm text-amber-800">
          <TriangleAlert size={18} className="mt-0.5" />
          <div>
            <p className="font-medium">Há execuções exigindo atenção.</p>
            <p className="mt-1">Use o painel avançado para ver logs, arquivos e detalhes de cada falha.</p>
          </div>
        </Card>
      ) : null}
    </main>
  )
}
