'use client'

import { useMemo, useState, type SyntheticEvent } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, CirclePause, FileSignature, Play, XCircle } from 'lucide-react'
import { StatusBadge } from '@/components/data/status-badge'
import { ListCollapsibleSectionHeader, ListEmptyState, ListPanel, ListRow, ListRows } from '@/components/layout/list-page'
import { Button } from '@/components/ui/button'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { cancelarFlowAcordos, criarFlowsAcordos, enviarFlowAcordos, pausarFlowAcordos, reenviarItemFlowAcordos } from '@/features/flows/acordos/actions'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'

type StepId = 'painel' | 'lotes' | 'flows'

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

function acordoEntity(acordo: any) {
  const unidade = relation(acordo?.unidade)
  const condominio = relation(unidade?.condominio ?? acordo?.condominio)
  return {
    condominio: condominio?.nome_operacional || condominio?.nome || 'Condomínio',
    unidade: unidade?.identificacao || '-',
    responsavel: unidade?.responsavel_nome || 'Responsável não informado',
    destinatario: unidade?.email || unidade?.telefone || '',
  }
}

function parcelaEntity(row: any) {
  const acordo = relation(row?.acordo)
  const unidade = relation(acordo?.unidade)
  const condominio = relation(acordo?.condominio)
  return {
    carteiraId: String(acordo?.carteira_id ?? ''),
    carteiraNome: relation(acordo?.carteira)?.nome ?? 'Carteira',
    condominioId: String(acordo?.condominio_id ?? ''),
    condominio: condominio?.nome_operacional || condominio?.nome || 'Condomínio',
    unidade: unidade?.identificacao || '-',
    responsavel: unidade?.responsavel_nome || 'Responsável não informado',
    hasResponsavel: Boolean(String(unidade?.responsavel_nome ?? '').trim()),
  }
}

function groupParcelasByCondominio(parcelas: any[]) {
  const groups = new Map<string, { id: string; nome: string; rows: any[]; total: number }>()
  for (const row of parcelas) {
    const entidade = parcelaEntity(row)
    const current = groups.get(entidade.condominioId || entidade.condominio) ?? { id: entidade.condominioId || entidade.condominio, nome: entidade.condominio, rows: [], total: 0 }
    current.rows.push(row)
    current.total += Number(row.valor ?? 0)
    groups.set(current.id, current)
  }
  return Array.from(groups.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function groupByCarteira(parcelas: any[]) {
  const groups = new Map<string, { carteiraId: string; carteiraNome: string; rows: any[]; total: number }>()
  for (const parcela of parcelas) {
    const entidade = parcelaEntity(parcela)
    if (!entidade.carteiraId) continue
    const current = groups.get(entidade.carteiraId) ?? { carteiraId: entidade.carteiraId, carteiraNome: entidade.carteiraNome, rows: [], total: 0 }
    current.rows.push(parcela)
    current.total += Number(parcela.valor ?? 0)
    groups.set(entidade.carteiraId, current)
  }
  return Array.from(groups.values()).sort((a, b) => a.carteiraNome.localeCompare(b.carteiraNome, 'pt-BR'))
}

export function FlowAcordosWorkbench({
  parcelas,
  reguas,
  flows,
  initialStep,
}: {
  parcelas: any[]
  reguas: any[]
  flows: any[]
  initialStep?: StepId
}) {
  const aptas = useMemo(() => parcelas.filter((row) => parcelaEntity(row).hasResponsavel), [parcelas])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedParcelas = useMemo(() => parcelas.filter((row) => selectedIds.includes(row.id)), [parcelas, selectedIds])
  const gruposCondominio = useMemo(() => groupParcelasByCondominio(parcelas), [parcelas])
  const gruposCarteira = useMemo(() => groupByCarteira(selectedParcelas), [selectedParcelas])
  const bloqueadasSemResponsavel = parcelas.length - aptas.length
  const allSelected = aptas.length > 0 && aptas.every((row) => selectedIds.includes(row.id))
  const [openSteps, setOpenSteps] = useState<Record<StepId, boolean>>({
    painel: initialStep === 'painel' || parcelas.length > 0,
    lotes: initialStep === 'lotes',
    flows: initialStep === 'flows' || flows.length > 0,
  })

  function syncStepOpen(step: StepId, event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.currentTarget !== event.target) return
    setOpenSteps((current) => ({ ...current, [step]: event.currentTarget.open }))
  }

  const toggleOne = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleAll = () => setSelectedIds(allSelected ? [] : aptas.map((row) => row.id))
  const toggleGroup = (groupRows: any[]) => {
    const ids = groupRows.filter((row) => parcelaEntity(row).hasResponsavel).map((row) => row.id)
    const selected = ids.length > 0 && ids.every((id) => selectedIds.includes(id))
    setSelectedIds((current) => selected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids])))
  }

  return <div className="space-y-3">
    <ListPanel>
      <details open={openSteps.painel} onToggle={(event) => syncStepOpen('painel', event)} className="group bg-white">
        <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <ListCollapsibleSectionHeader title="Parcelas geradas / ativas" count={parcelas.length} />
        </summary>
        {parcelas.length ? <>
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={allSelected} disabled={aptas.length === 0} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)]" />
              Selecionar todas aptas
            </label>
            <div className="flex flex-wrap items-center gap-3 md:justify-end">
              <p className="text-sm text-slate-500">
                {selectedIds.length} de {aptas.length} apta(s){bloqueadasSemResponsavel ? ` · ${bloqueadasSemResponsavel} sem responsável` : ''}
              </p>
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpenSteps((current) => ({ ...current, lotes: true }))} disabled={selectedIds.length === 0}>
                Montar lote
              </Button>
            </div>
          </div>
          {bloqueadasSemResponsavel ? (
            <div className="border-b border-slate-100 px-5 py-2">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                <AlertTriangle size={13} />Parcelas de unidades sem responsável não podem evoluir.
              </p>
            </div>
          ) : null}
          <div className="divide-y divide-slate-100">
            {gruposCondominio.map((grupo) => {
              const rowsAptas = grupo.rows.filter((row) => parcelaEntity(row).hasResponsavel)
              const groupSelected = rowsAptas.length > 0 && rowsAptas.every((row) => selectedIds.includes(row.id))
              return <details key={grupo.id} className="group/condominio bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-slate-50/70 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                  <div className="flex min-w-0 items-center gap-3">
                    <ChevronDown size={18} className="text-slate-400 transition-transform group-open/condominio:rotate-180" />
                    <input aria-label={`Selecionar parcelas de ${grupo.nome}`} type="checkbox" checked={groupSelected} disabled={rowsAptas.length === 0} onClick={(event) => event.stopPropagation()} onChange={() => toggleGroup(grupo.rows)} className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)]" />
                    <div><p className="text-sm font-semibold text-slate-950">{grupo.nome}</p><p className="text-xs text-slate-500">{grupo.rows.length} parcela(s) · {formatCurrency(grupo.total)}</p></div>
                  </div>
                </summary>
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {grupo.rows.map((row) => {
                    const entidade = parcelaEntity(row)
                    return <div key={row.id} className="grid gap-3 px-4 py-3 xl:grid-cols-[32px_minmax(280px,1fr)_130px_150px_140px] xl:items-center">
                      <input aria-label={`Selecionar parcela da unidade ${entidade.unidade}`} type="checkbox" checked={selectedIds.includes(row.id)} disabled={!entidade.hasResponsavel} onChange={() => toggleOne(row.id)} className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] disabled:cursor-not-allowed disabled:opacity-40" />
                      <div>
                        <div className="flex flex-wrap gap-2"><StatusBadge status={row.status || 'aberta'} /><span className="rounded-full border border-sky-100 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">{row.janela}</span>{!entidade.hasResponsavel ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"><AlertTriangle size={12} />Sem responsável</span> : null}</div>
                        <p className="mt-2 text-sm font-semibold text-slate-950">Unidade {entidade.unidade}</p>
                        <p className="mt-1 text-xs text-slate-500">{entidade.responsavel}</p>
                      </div>
                      <div><p className="text-xs uppercase tracking-[0.14em] text-slate-400">Parcela</p><p className="mt-1 text-sm font-medium">{row.numero ?? '-'}</p></div>
                      <div><p className="text-xs uppercase tracking-[0.14em] text-slate-400">Vencimento</p><p className="mt-1 text-sm font-medium">{formatDateBR(row.vencimento)}</p></div>
                      <div><p className="text-xs uppercase tracking-[0.14em] text-slate-400">Valor</p><p className="mt-1 text-sm font-semibold">{formatCurrency(Number(row.valor ?? 0))}</p></div>
                    </div>
                  })}
                </div>
              </details>
            })}
          </div>
        </> : <ListEmptyState title="Nenhuma parcela disponível" description="Acordos com parcelas abertas/vencidas aparecerão aqui para montar o Flow." />}
      </details>
    </ListPanel>

    <ListPanel>
      <details open={openSteps.lotes} onToggle={(event) => syncStepOpen('lotes', event)} className="group bg-white">
        <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <ListCollapsibleSectionHeader title="Lotes + régua" count={gruposCarteira.length} />
        </summary>
        {gruposCarteira.length ? <form action={criarFlowsAcordos} onSubmit={(event) => { if (!window.confirm(`Criar ${gruposCarteira.length} Flow(s) de acordos?`)) event.preventDefault() }}>
          {selectedParcelas.map((parcela) => <input key={parcela.id} type="hidden" name="parcela_id" value={parcela.id} />)}
          <div className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600">
            {selectedParcelas.length} parcela(s) selecionada(s), agrupadas em {gruposCarteira.length} lote(s) por carteira.
          </div>
          <ListRows>
            {gruposCarteira.map((grupo) => {
              const opcoesRegua = reguas.filter((regua: any) => !regua.carteira_id || regua.carteira_id === grupo.carteiraId)
              const defaultRegua = opcoesRegua.find((regua: any) => regua.carteira_id === grupo.carteiraId)?.id ?? opcoesRegua[0]?.id ?? ''
              return <ListRow key={grupo.carteiraId} className="bg-white lg:grid-cols-[minmax(260px,1fr)_150px_150px_minmax(260px,1fr)]">
                <div><p className="text-sm font-semibold text-slate-950">{grupo.carteiraNome}</p><p className="mt-1 text-xs text-slate-500">{grupo.rows.length} parcela(s) selecionada(s)</p></div>
                <div><p className="text-xs text-slate-400">Total</p><p className="text-sm font-medium text-slate-800">{formatCurrency(grupo.total)}</p></div>
                <div><p className="text-xs text-slate-400">Janela</p><p className="text-sm font-medium text-slate-800">pagamento</p></div>
                <label className="space-y-1.5"><span className="text-xs font-medium uppercase text-slate-400">Régua</span><select name={`regua_id:${grupo.carteiraId}`} defaultValue={defaultRegua} required className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[var(--gkli-primary)] focus:ring-2 focus:ring-[var(--gkli-primary)]/10"><option value="">Selecione</option>{opcoesRegua.map((regua: any) => <option key={regua.id} value={regua.id}>{regua.nome}{regua.carteira_id ? '' : ' · global'}</option>)}</select></label>
              </ListRow>
            })}
          </ListRows>
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
            <PendingSubmitButton pendingLabel="Criando flows..."><CheckCircle2 size={16} />Criar Flow</PendingSubmitButton>
          </div>
        </form> : <ListEmptyState title="Nenhum lote montado" description="Selecione parcelas no painel e clique em Montar lote." />}
      </details>
    </ListPanel>

    <ListPanel>
      <details open={openSteps.flows} onToggle={(event) => syncStepOpen('flows', event)} className="group bg-white">
        <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <ListCollapsibleSectionHeader title="Flows" count={flows.length} />
        </summary>
        {flows.length ? <ListRows>{flows.map((flow: any) => <FlowRow key={flow.id} flow={flow} />)}</ListRows> : <ListEmptyState title="Nenhum Flow criado ainda" description="Depois de criar um Flow, ele aparecerá aqui para envio e monitoramento das parcelas." />}
      </details>
    </ListPanel>
  </div>
}

function FlowRow({ flow }: { flow: any }) {
  const status = String(flow.status ?? 'pronto')
  const carteira = relation(flow.carteira)
  const regua = relation(flow.regua)
  const lote = relation(flow.lote)
  const itens = Array.isArray(flow.itens) ? flow.itens : []
  const counters = {
    pendentes: n(flow.total_pendentes),
    agendadas: n(flow.total_agendadas),
    enviadas: n(flow.total_enviadas),
    falhas: n(flow.total_falhas),
  }
  return <details className="group/flow">
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
          Criado em {formatDateTimeBR(flow.created_at)} · {itens.length} parcela(s) no Flow · Lote {lote?.status ? lote.status : 'sem status'}
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {status === 'pronto' || status === 'pausado' ? (
          <form action={enviarFlowAcordos.bind(null, flow.id)}><PendingSubmitButton pendingLabel={status === 'pausado' ? 'Retomando...' : 'Enviando...'}><Play size={16} />{status === 'pausado' ? 'Retomar' : 'Enviar'}</PendingSubmitButton></form>
        ) : null}
        {status === 'em_execucao' ? (
          <form action={pausarFlowAcordos.bind(null, flow.id)}><PendingSubmitButton variant="secondary" pendingLabel="Pausando..."><CirclePause size={16} />Pausar</PendingSubmitButton></form>
        ) : null}
        {!['cancelado', 'concluido', 'concluido_com_falhas'].includes(status) ? (
          <form action={cancelarFlowAcordos.bind(null, flow.id)} onSubmit={(event) => { if (!window.confirm('Cancelar este Flow e os disparos pendentes?')) event.preventDefault() }}><PendingSubmitButton variant="secondary" pendingLabel="Cancelando..."><XCircle size={16} />Cancelar</PendingSubmitButton></form>
        ) : null}
      </div>
    </div>
    <div className="border-t border-slate-100 bg-white px-4 py-3">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold text-slate-950">Fila de pagamento</p><p className="text-xs text-slate-500">Parcela, destino, agenda e falhas de cada item do Flow.</p></div>
        <span className="text-xs text-slate-400">{counters.falhas ? `${counters.falhas} item(ns) com falha` : 'Sem falhas abertas'}</span>
      </div>
      {itens.length ? (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="hidden bg-slate-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-400 lg:grid lg:grid-cols-[120px_minmax(280px,1fr)_minmax(200px,0.8fr)_170px_110px] lg:items-center">
            <span>Status</span><span>Parcela</span><span>Destino</span><span>Agenda</span><span className="text-right">Ação</span>
          </div>
          {itens.map((item: any) => <FlowItemRow key={item.id} item={item} />)}
        </div>
      ) : <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Nenhum item vinculado a este Flow ainda.</div>}
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
  return <div className={`rounded-xl border px-2.5 py-2 ${classes[tone]}`}><p className="text-[10px] font-medium uppercase tracking-wide opacity-70">{label}</p><p className="mt-0.5 text-sm font-semibold">{String(value ?? 0)}</p></div>
}

function FlowItemRow({ item }: { item: any }) {
  const mensagem = relation(item.mensagem)
  const acordo = relation(item.acordo)
  const entidade = acordoEntity(acordo)
  const itemStatus = String(item.status ?? 'criado')
  const messageStatus = String(mensagem?.status_operacional ?? mensagem?.status ?? '')
  const effectiveStatus = messageStatus || itemStatus
  const statusLabel = MESSAGE_STATUS_LABEL[effectiveStatus] ?? effectiveStatus
  const hasFailure = isFailureStatus(effectiveStatus) || Boolean(cleanText(mensagem?.erro_envio ?? mensagem?.erro))
  const reason = hasFailure ? failureReason(item, mensagem) : ''
  const destino = mensagem?.email_destinatario || mensagem?.destinatario || entidade.destinatario || 'Destino não informado'
  const payload = mensagem?.payload ?? item.payload ?? {}
  const contexto = payload?.contexto ?? item.payload?.contexto ?? {}
  const parcela = contexto?.parcela_numero || contexto?.parcela || payload?.parcela_id || ''
  const vencimento = contexto?.vencimento || ''

  return <div className="grid gap-3 px-4 py-3 transition hover:bg-slate-50 lg:grid-cols-[120px_minmax(280px,1fr)_minmax(200px,0.8fr)_170px_110px] lg:items-center">
    <div><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${itemStatusClass(effectiveStatus)}`}>{statusLabel}</span></div>
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-slate-950">{entidade.condominio}</p>
      <p className="mt-1 truncate text-xs text-slate-500">Unidade {entidade.unidade} · Parcela {parcela || '-'}{vencimento ? ` · venc. ${vencimento}` : ''}</p>
    </div>
    <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{destino}</p></div>
    <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{messageScheduleLabel(mensagem)}</p></div>
    <div className="flex justify-start lg:justify-end">
      {hasFailure ? <form action={reenviarItemFlowAcordos.bind(null, item.id)} className="shrink-0"><PendingSubmitButton variant="secondary" size="sm" pendingLabel="Reagendando...">Reenviar</PendingSubmitButton></form> : <span className="text-xs text-slate-300">—</span>}
    </div>
    {hasFailure ? <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700 lg:col-span-5"><p><span className="font-semibold">Motivo da falha:</span> <span className="break-words">{reason}</span></p></div> : null}
  </div>
}
