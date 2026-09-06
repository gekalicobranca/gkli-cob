'use client'

import { useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ChevronRight, CirclePause, FileSignature, Play, RefreshCw, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { ListCollapsibleSectionHeader, ListEmptyState, ListPanel, ListRow, ListRows } from '@/components/layout/list-page'
import { Button } from '@/components/ui/button'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { cancelarFlowCobranca, criarFlowsCobranca, desfazerAtivacaoCobrancasFlowCobranca, enviarFlowCobranca, excluirFlowCobranca, pausarFlowCobranca, reenviarItemFlowCobranca } from '@/features/flows/cobranca/actions'
import { formatCurrency } from '@/utils/formatters/currency'

type StepId = 'lotes' | 'flows'

const relation = (value: any) => Array.isArray(value) ? value[0] : value
const n = (value: unknown) => Number(value ?? 0) || 0

const FLOW_STATUS_LABEL: Record<string, string> = {
  pronto: 'Pronto',
  em_execucao: 'Em execução',
  pausado: 'Pausado',
  cancelado: 'Cancelado',
  concluido: 'Concluído',
  concluido_com_falhas: 'Concluído com falhas',
}

const MESSAGE_STATUS_LABEL: Record<string, string> = {
  pendente_aprovacao: 'Pendente',
  aprovada: 'Aprovada',
  agendada: 'Agendada',
  enviada: 'Enviada',
  falha: 'Falha',
  cancelada: 'Cancelada',
}

function statusClass(status: string) {
  if (status === 'em_execucao') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'pronto') return 'border-sky-200 bg-sky-50 text-sky-700'
  if (status === 'pausado') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (status === 'concluido') return 'border-slate-200 bg-slate-50 text-slate-700'
  return 'border-rose-100 bg-rose-50 text-rose-700'
}

function itemStatusClass(status: string) {
  if (['aprovado', 'aprovada', 'agendada', 'enviada'].includes(status)) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (['criado', 'pendente_aprovacao'].includes(status)) return 'border-sky-200 bg-sky-50 text-sky-700'
  if (['duplicada', 'pulada'].includes(status)) return 'border-amber-200 bg-amber-50 text-amber-700'
  if (['cancelado', 'cancelada', 'erro', 'falha'].includes(status)) return 'border-rose-100 bg-rose-50 text-rose-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function formatDateTimeBR(value: string | null | undefined) {
  if (!value) return 'Sem agendamento'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value))
}

function messageScheduleLabel(mensagem: any) {
  if (mensagem?.agendada_para || mensagem?.scheduled_at) return formatDateTimeBR(mensagem.agendada_para ?? mensagem.scheduled_at)
  if (mensagem?.enviada_em || mensagem?.sent_at) return formatDateTimeBR(mensagem.enviada_em ?? mensagem.sent_at)
  if (mensagem?.erro_envio || mensagem?.erro) return 'Falha no envio'
  return 'Sem agenda'
}

function cleanText(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

function payloadFailureReason(payload: any) {
  if (!payload || typeof payload !== 'object') return ''
  const candidates = [
    payload.erro_envio,
    payload.erro,
    payload.ultimo_erro,
    payload.motivo,
    payload.reason,
    payload.error,
    payload.message,
    payload.mensagem?.erro_envio,
    payload.mensagem?.erro,
  ]
  return candidates.map(cleanText).find(Boolean) ?? ''
}

function failureReason(item: any, mensagem: any) {
  const candidates = [
    mensagem?.erro_envio,
    mensagem?.erro,
    mensagem?.ultimo_erro,
    item?.motivo,
    payloadFailureReason(item?.payload),
  ]
  return candidates.map(cleanText).find(Boolean) ?? 'Falha sem detalhe técnico registrado.'
}

function isFailureStatus(status: string) {
  return ['falha', 'erro'].includes(status)
}

function cobrancaValue(row: any) {
  return Number(row?.valor_atualizado ?? row?.valor_original ?? 0)
}

function groupByCarteira(cobrancas: any[]) {
  const groups = new Map<string, { carteiraId: string; carteiraNome: string; rows: any[]; total: number }>()
  for (const cobranca of cobrancas) {
    const carteiraId = String(cobranca.carteira_id ?? '')
    if (!carteiraId) continue
    const current = groups.get(carteiraId) ?? {
      carteiraId,
      carteiraNome: relation(cobranca.carteira)?.nome ?? 'Carteira',
      rows: [],
      total: 0,
    }
    current.rows.push(cobranca)
    current.total += cobrancaValue(cobranca)
    groups.set(carteiraId, current)
  }
  return Array.from(groups.values()).sort((a, b) => a.carteiraNome.localeCompare(b.carteiraNome, 'pt-BR'))
}

function cobrancaEntity(cobranca: any) {
  const unidade = relation(cobranca?.unidade)
  const condominio = relation(cobranca?.condominio ?? unidade?.condominio)
  return {
    condominio: condominio?.nome_operacional || condominio?.nome || 'Condomínio',
    unidade: unidade?.identificacao || '-',
    responsavel: unidade?.responsavel_nome || 'Responsável não informado',
    destinatario: unidade?.email || unidade?.telefone || '',
  }
}

export function FlowCobrancaWorkbench({
  disponibilidade,
  reguas,
  flows,
  initialStep,
  initialSelectedIds = [],
}: {
  disponibilidade: any[]
  reguas: any[]
  flows: any[]
  initialStep?: StepId
  initialSelectedIds?: string[]
}) {
  const [selected, setSelected] = useState<string[]>(initialSelectedIds)
  const selectedCobrancas = useMemo(() => disponibilidade.filter((cobranca) => selected.includes(cobranca.id)), [disponibilidade, selected])
  const grupos = useMemo(() => groupByCarteira(selectedCobrancas), [selectedCobrancas])
  const gruposDisponiveis = useMemo(() => groupByCarteira(disponibilidade), [disponibilidade])
  const [openSteps, setOpenSteps] = useState<Record<StepId, boolean>>({
    lotes: initialStep === 'lotes' || gruposDisponiveis.length > 0,
    flows: initialStep === 'flows' || flows.length > 0,
  })

  useEffect(() => {
    if (!grupos.length) return
    setOpenSteps((current) => current.lotes ? current : { ...current, lotes: true })
  }, [grupos.length])

  function syncStepOpen(step: StepId, event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.currentTarget !== event.target) return
    const isOpen = event.currentTarget.open
    setOpenSteps((current) => ({ ...current, [step]: isOpen }))
  }

  function toggleGrupo(rows: any[]) {
    const ids = rows.map((row) => String(row.id)).filter(Boolean)
    const todosSelecionados = ids.length > 0 && ids.every((id) => selected.includes(id))
    setSelected((current) => todosSelecionados
      ? current.filter((id) => !ids.includes(id))
      : Array.from(new Set([...current, ...ids])))
  }

  return <div className="space-y-3">
    <ListPanel>
      <details open={openSteps.lotes} onToggle={(event) => syncStepOpen('lotes', event)} className="group bg-white">
        <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <ListCollapsibleSectionHeader title="Lotes + régua" count={grupos.length} />
        </summary>
        {gruposDisponiveis.length ? <form action={criarFlowsCobranca}>
          {selectedCobrancas.map((cobranca) => <input key={cobranca.id} type="hidden" name="cobranca_id" value={cobranca.id} />)}
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
            <p className="text-sm text-slate-600">{selectedCobrancas.length} de {disponibilidade.length} cobrança(s) ativa(s) selecionada(s), agrupadas em {grupos.length} lote(s) por carteira.</p>
          </div>
          <ListRows>
            {gruposDisponiveis.map((grupo) => {
              const selecionadasNoGrupo = grupo.rows.filter((row) => selected.includes(row.id))
              const grupoSelecionado = grupo.rows.length > 0 && selecionadasNoGrupo.length === grupo.rows.length
              const opcoesRegua = reguas.filter((regua: any) => !regua.carteira_id || regua.carteira_id === grupo.carteiraId)
              const defaultRegua = opcoesRegua.find((regua: any) => regua.carteira_id === grupo.carteiraId)?.id ?? opcoesRegua[0]?.id ?? ''
              return <ListRow key={grupo.carteiraId} className="bg-white lg:grid-cols-[minmax(260px,1fr)_140px_150px_minmax(260px,1fr)]">
                <div>
                  <label className="inline-flex items-center gap-3 text-sm font-semibold text-slate-950"><input type="checkbox" checked={grupoSelecionado} onChange={() => toggleGrupo(grupo.rows)} className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)]" />{grupo.carteiraNome}</label>
                  <p className="mt-1 text-xs text-slate-500">{selecionadasNoGrupo.length} de {grupo.rows.length} cobrança(s) selecionada(s)</p>
                </div>
                <div><p className="text-xs text-slate-400">Total selecionado</p><p className="text-sm font-medium text-slate-800">{formatCurrency(selecionadasNoGrupo.reduce((sum, row) => sum + cobrancaValue(row), 0))}</p></div>
                <div><p className="text-xs text-slate-400">Lote</p><p className="text-sm text-slate-700">{selecionadasNoGrupo.length ? '1 lote' : 'Não selecionado'}</p></div>
                <label className="text-xs font-medium text-slate-600">
                  Régua do Flow
                  <select name={`regua_id:${grupo.carteiraId}`} required={selecionadasNoGrupo.length > 0} disabled={selecionadasNoGrupo.length === 0} defaultValue={defaultRegua} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-400">
                    <option value="" disabled>Selecione</option>
                    {opcoesRegua.map((regua: any) => <option key={regua.id} value={regua.id}>{regua.nome}{regua.carteira_id ? '' : ' · global'}</option>)}
                  </select>
                </label>
              </ListRow>
            })}
          </ListRows>
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
            <PendingSubmitButton formAction={desfazerAtivacaoCobrancasFlowCobranca} formNoValidate variant="danger" disabled={selectedCobrancas.length === 0} pendingLabel="Desfazendo..." onClick={(event) => { if (!window.confirm(`Devolver ${selectedCobrancas.length} cobrança(s) para Novas?`)) event.preventDefault() }}><RotateCcw size={16} />Desfazer ativação</PendingSubmitButton>
            <PendingSubmitButton disabled={selectedCobrancas.length === 0} pendingLabel="Criando flows..." onClick={(event) => { if (!window.confirm(`Criar ${grupos.length} Flow(s) de cobrança?`)) event.preventDefault() }}><CheckCircle2 size={16} />Criar Flow</PendingSubmitButton>
          </div>
        </form> : <ListEmptyState title="Nenhum lote montado" description="Selecione cobranças novas no painel e clique em Ativar para montar o lote automaticamente." />}
      </details>
    </ListPanel>

    <ListPanel>
      <details open={openSteps.flows} onToggle={(event) => syncStepOpen('flows', event)} className="group bg-white">
        <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <ListCollapsibleSectionHeader title="Flows" count={flows.length} />
        </summary>
        {flows.length ? <ListRows>{flows.map((flow: any) => <FlowRow key={flow.id} flow={flow} />)}</ListRows> : <ListEmptyState title="Nenhum Flow criado ainda" description="Depois de criar um Flow, ele aparecerá aqui para envio e monitoramento." />}
      </details>
    </ListPanel>
  </div>
}

function FlowRow({ flow }: { flow: any }) {
  const router = useRouter()
  const status = String(flow.status ?? 'pronto')
  const carteira = relation(flow.carteira)
  const regua = relation(flow.regua)
  const lote = relation(flow.lote)
  const [itens, setItens] = useState<any[]>(Array.isArray(flow.itens) ? flow.itens : [])
  const [itensLoaded, setItensLoaded] = useState(itens.length > 0)
  const [itensLoading, setItensLoading] = useState(false)
  const [itensError, setItensError] = useState('')
  const [processando, setProcessando] = useState(false)
  const [processarError, setProcessarError] = useState('')
  const counters = {
    pendentes: n(flow.total_pendentes),
    agendadas: n(flow.total_agendadas),
    enviadas: n(flow.total_enviadas),
    falhas: n(flow.total_falhas),
  }
  const itensResumo = itensLoaded ? itens.length : n(flow.total_mensagens)

  async function loadItens() {
    if (itensLoaded || itensLoading) return
    setItensLoading(true)
    setItensError('')
    try {
      const response = await fetch(`/api/flows/cobranca/${flow.id}/itens`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível carregar os itens do Flow.')
      setItens(Array.isArray(payload?.itens) ? payload.itens : [])
      setItensLoaded(true)
    } catch (error) {
      setItensError(error instanceof Error ? error.message : 'Não foi possível carregar os itens do Flow.')
    } finally {
      setItensLoading(false)
    }
  }

  async function processarAgora() {
    if (processando) return
    setProcessando(true)
    setProcessarError('')
    try {
      const response = await fetch(`/api/flows/cobranca/${flow.id}/processar`, { method: 'POST' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível processar o Flow.')
      setItensLoaded(false)
      setItens([])
      router.refresh()
    } catch (error) {
      setProcessarError(error instanceof Error ? error.message : 'Não foi possível processar o Flow.')
    } finally {
      setProcessando(false)
    }
  }

  return <details className="group/flow" onToggle={(event) => { if (event.currentTarget.open) void loadItens() }}>
    <summary className="list-none [&::-webkit-details-marker]:hidden">
      <ListRow className="cursor-pointer bg-white lg:grid-cols-[minmax(320px,1.2fr)_minmax(360px,1fr)_190px_24px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(status)}`}>{FLOW_STATUS_LABEL[status] ?? status}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600"><FileSignature size={13} />{n(flow.total_mensagens)} mensagens</span>
          </div>
          <p className="mt-2 truncate text-sm font-semibold text-slate-950">{flow.nome}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{carteira?.nome || 'Carteira'} · {regua?.nome || 'Régua'} · Lote {String(flow.lote_id ?? '').slice(0, 8)}</p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <FlowCounter label="Pend." value={counters.pendentes} />
          <FlowCounter label="Agenda" value={counters.agendadas} tone="sky" />
          <FlowCounter label="Env." value={counters.enviadas} tone="emerald" />
          <FlowCounter label="Falha" value={counters.falhas} tone={counters.falhas ? 'rose' : 'slate'} />
        </div>
        <div><p className="text-xs text-slate-400">Próximo disparo</p><p className="text-sm font-medium text-slate-800">{formatDateTimeBR(flow.proximo_disparo_em)}</p></div>
        <ChevronRight size={17} className="text-slate-400 transition group-open/flow:rotate-90" />
      </ListRow>
    </summary>
    <div className="grid gap-4 border-t border-slate-100 bg-slate-50/70 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
      <div>
        <p className="text-sm font-semibold text-slate-950">Resumo do monitor</p>
        <p className="mt-1 text-xs text-slate-500">
          Criado em {formatDateTimeBR(flow.created_at)} · {itensResumo} item(ns) no Flow · Lote {lote?.status ? lote.status : 'sem status'}
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {status === 'pronto' || status === 'pausado' ? (
          <form action={enviarFlowCobranca.bind(null, flow.id)}><PendingSubmitButton pendingLabel={status === 'pausado' ? 'Retomando...' : 'Enviando...'}><Play size={16} />{status === 'pausado' ? 'Retomar' : 'Enviar'}</PendingSubmitButton></form>
        ) : null}
        {status === 'em_execucao' ? (
          <>
            <Button type="button" disabled={processando} onClick={() => void processarAgora()}>
              <RefreshCw size={16} className={processando ? 'animate-spin' : ''} />{processando ? 'Processando...' : 'Processar agora'}
            </Button>
            <form action={pausarFlowCobranca.bind(null, flow.id)}><PendingSubmitButton variant="secondary" pendingLabel="Pausando..."><CirclePause size={16} />Pausar</PendingSubmitButton></form>
          </>
        ) : null}
        {!['cancelado', 'concluido', 'concluido_com_falhas'].includes(status) ? (
          <form action={cancelarFlowCobranca.bind(null, flow.id)} onSubmit={(event) => { if (!window.confirm('Cancelar este Flow e os disparos pendentes?')) event.preventDefault() }}><PendingSubmitButton variant="secondary" pendingLabel="Cancelando..."><XCircle size={16} />Cancelar</PendingSubmitButton></form>
        ) : null}
        {status !== 'em_execucao' && counters.enviadas === 0 ? (
          <form action={excluirFlowCobranca.bind(null, flow.id)} onSubmit={(event) => { if (!window.confirm('Excluir permanentemente este Flow, o lote e as mensagens nunca enviadas?')) event.preventDefault() }}><PendingSubmitButton variant="danger" pendingLabel="Excluindo..."><Trash2 size={16} />Excluir Flow</PendingSubmitButton></form>
        ) : null}
      </div>
      {processarError ? <p className="text-xs font-medium text-rose-700 lg:col-span-2">{processarError}</p> : null}
    </div>
    <div className="border-t border-slate-100 bg-white px-4 py-3">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Fila de envio</p>
          <p className="text-xs text-slate-500">Status, destino, agenda e falhas de cada item do Flow.</p>
        </div>
        <span className="text-xs text-slate-400">{counters.falhas ? `${counters.falhas} item(ns) com falha` : 'Sem falhas abertas'}</span>
      </div>
      {itensLoading ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
          Carregando fila do Flow...
        </div>
      ) : itensError ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
          {itensError}
        </div>
      ) : itens.length ? (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="hidden bg-slate-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-400 lg:grid lg:grid-cols-[120px_minmax(280px,1fr)_minmax(220px,0.9fr)_170px_110px] lg:items-center">
            <span>Status</span>
            <span>Cobrança</span>
            <span>Destino</span>
            <span>Agenda</span>
            <span className="text-right">Ação</span>
          </div>
          {itens.map((item: any) => <FlowItemRow key={item.id} item={item} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
          Nenhum item vinculado a este Flow ainda.
        </div>
      )}
    </div>
  </details>
}

function FlowCounter({ label, value, tone = 'slate' }: { label: string; value: unknown; tone?: 'slate' | 'sky' | 'emerald' | 'rose' }) {
  const classes = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    sky: 'border-sky-100 bg-sky-50 text-sky-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-100 bg-rose-50 text-rose-700',
  }
  return (
    <div className={`rounded-xl border px-2.5 py-2 ${classes[tone]}`}>
      <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{String(value ?? 0)}</p>
    </div>
  )
}

function FlowItemRow({ item }: { item: any }) {
  const mensagem = relation(item.mensagem)
  const cobranca = relation(item.cobranca)
  const entidade = cobrancaEntity(cobranca)
  const itemStatus = String(item.status ?? 'criado')
  const messageStatus = String(mensagem?.status_operacional ?? mensagem?.status ?? '')
  const effectiveStatus = messageStatus || itemStatus
  const statusLabel = MESSAGE_STATUS_LABEL[effectiveStatus] ?? effectiveStatus
  const hasFailure = isFailureStatus(effectiveStatus) || Boolean(cleanText(mensagem?.erro_envio ?? mensagem?.erro))
  const reason = hasFailure ? failureReason(item, mensagem) : ''
  const destino = mensagem?.email_destinatario || mensagem?.destinatario || entidade.destinatario || 'Destino não informado'

  return (
    <div className="grid gap-3 px-4 py-3 transition hover:bg-slate-50 lg:grid-cols-[120px_minmax(280px,1fr)_minmax(220px,0.9fr)_170px_110px] lg:items-center">
      <div>
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${itemStatusClass(effectiveStatus)}`}>
          {statusLabel}
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">{entidade.condominio}</p>
        <p className="mt-1 truncate text-xs text-slate-500">Unidade {entidade.unidade} · {entidade.responsavel}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{destino}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{messageScheduleLabel(mensagem)}</p>
      </div>
      <div className="flex justify-start lg:justify-end">
        {hasFailure ? (
          <form action={reenviarItemFlowCobranca.bind(null, item.id)} className="shrink-0">
            <PendingSubmitButton variant="secondary" size="sm" pendingLabel="Reagendando...">
              Reenviar
            </PendingSubmitButton>
          </form>
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </div>
      {hasFailure ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700 lg:col-span-5">
          <p>
            <span className="font-semibold">Motivo da falha:</span> <span className="break-words">{reason}</span>
          </p>
        </div>
      ) : null}
    </div>
  )
}
