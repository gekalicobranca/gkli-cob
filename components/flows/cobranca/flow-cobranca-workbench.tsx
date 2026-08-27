'use client'

import { useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import { CheckCircle2, ChevronRight, CirclePause, FileText, Play, RefreshCcw, XCircle } from 'lucide-react'
import { ListCollapsibleSectionHeader, ListEmptyState, ListPanel, ListRow, ListRows } from '@/components/layout/list-page'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { cancelarFlowCobranca, criarFlowsCobranca, enviarFlowCobranca, pausarFlowCobranca, reenviarItemFlowCobranca } from '@/features/flows/cobranca/actions'
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
  initialStep = 'lotes',
  initialSelectedIds = [],
}: {
  disponibilidade: any[]
  reguas: any[]
  flows: any[]
  initialStep?: StepId
  initialSelectedIds?: string[]
}) {
  const [selected] = useState<string[]>(initialSelectedIds)
  const selectedCobrancas = useMemo(() => disponibilidade.filter((cobranca) => selected.includes(cobranca.id)), [disponibilidade, selected])
  const grupos = useMemo(() => groupByCarteira(selectedCobrancas), [selectedCobrancas])
  const [openSteps, setOpenSteps] = useState<Record<StepId, boolean>>({
    lotes: initialStep === 'lotes' || grupos.length > 0,
    flows: initialStep === 'flows' || flows.length > 0,
  })

  useEffect(() => {
    if (!grupos.length) return
    setOpenSteps((current) => current.lotes ? current : { ...current, lotes: true })
  }, [grupos.length])

  function syncStepOpen(step: StepId, event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.currentTarget !== event.target) return
    setOpenSteps((current) => ({ ...current, [step]: event.currentTarget.open }))
  }

  return <div className="space-y-3">
    <ListPanel>
      <details open={openSteps.lotes} onToggle={(event) => syncStepOpen('lotes', event)} className="group bg-white">
        <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <ListCollapsibleSectionHeader title="Lotes + régua" count={grupos.length} />
        </summary>
        <form action={criarFlowsCobranca} onSubmit={(event) => { if (!window.confirm(`Criar ${grupos.length} Flow(s) de cobrança?`)) event.preventDefault() }}>
          {selected.map((id) => <input key={id} type="hidden" name="cobranca_id" value={id} />)}
          <div>
            {selected.length ? <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
              <p className="text-sm text-slate-600">{selected.length} cobrança(s) selecionada(s), agrupadas em {grupos.length} lote(s) por carteira.</p>
            </div> : null}
            {grupos.length ? <ListRows>
              {grupos.map((grupo) => {
                const opcoesRegua = reguas.filter((regua: any) => !regua.carteira_id || regua.carteira_id === grupo.carteiraId)
                const defaultRegua = opcoesRegua.find((regua: any) => regua.carteira_id === grupo.carteiraId)?.id ?? opcoesRegua[0]?.id ?? ''
                return <ListRow key={grupo.carteiraId} className="bg-white lg:grid-cols-[minmax(260px,1fr)_140px_150px_minmax(260px,1fr)]">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{grupo.carteiraNome}</p>
                    <p className="mt-1 text-xs text-slate-500">{grupo.rows.length} cobrança(s) selecionada(s)</p>
                  </div>
                  <div><p className="text-xs text-slate-400">Total</p><p className="text-sm font-medium text-slate-800">{formatCurrency(grupo.total)}</p></div>
                  <div><p className="text-xs text-slate-400">Lote</p><p className="text-sm text-slate-700">1 lote</p></div>
                  <label className="text-xs font-medium text-slate-600">
                    Régua do Flow
                    <select name={`regua_id:${grupo.carteiraId}`} required defaultValue={defaultRegua} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900">
                      <option value="" disabled>Selecione</option>
                      {opcoesRegua.map((regua: any) => <option key={regua.id} value={regua.id}>{regua.nome}{regua.carteira_id ? '' : ' · global'}</option>)}
                    </select>
                  </label>
                </ListRow>
              })}
            </ListRows> : <ListEmptyState title="Nenhum lote montado" description="Selecione cobranças novas no painel e clique em Ativar para montar o lote automaticamente." />}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <PendingSubmitButton disabled={!grupos.length} pendingLabel="Criando flows..."><CheckCircle2 size={16} />Criar Flow</PendingSubmitButton>
            </div>
          </div>
        </form>
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
  const status = String(flow.status ?? 'pronto')
  const carteira = relation(flow.carteira)
  const regua = relation(flow.regua)
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
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600"><FileText size={13} />{n(flow.total_mensagens)} mensagens</span>
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
        <p className="text-sm font-semibold text-slate-950">Itens do Flow</p>
        <p className="mt-1 text-xs text-slate-500">Cobranças e mensagens vinculadas ao lote {String(flow.lote_id ?? '').slice(0, 8)}.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {status === 'pronto' || status === 'pausado' ? <form action={enviarFlowCobranca.bind(null, flow.id)}><PendingSubmitButton pendingLabel="Enviando..."><Play size={15} />Enviar</PendingSubmitButton></form> : null}
        {status === 'em_execucao' ? <form action={pausarFlowCobranca.bind(null, flow.id)}><PendingSubmitButton variant="secondary" pendingLabel="Pausando..."><CirclePause size={15} />Pausar</PendingSubmitButton></form> : null}
        {!['cancelado', 'concluido', 'concluido_com_falhas'].includes(status) ? <form action={cancelarFlowCobranca.bind(null, flow.id)}><PendingSubmitButton variant="secondary" pendingLabel="Cancelando..."><XCircle size={15} />Cancelar</PendingSubmitButton></form> : null}
      </div>
    </div>
    {itens.length ? <div className="border-t border-slate-100 bg-slate-50/70 px-5 pb-5">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {itens.map((item: any) => <FlowItemRow key={item.id} item={item} />)}
      </div>
    </div> : <div className="border-t border-slate-100 bg-slate-50/70 px-5 pb-5"><ListEmptyState title="Nenhum item neste Flow" description="O lote ainda não possui itens vinculados." /></div>}
  </details>
}

function FlowCounter({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'sky' | 'emerald' | 'rose' }) {
  const valueClass = tone === 'sky' ? 'text-sky-700' : tone === 'emerald' ? 'text-emerald-700' : tone === 'rose' ? 'text-rose-700' : 'text-slate-800'
  return <div>
    <p className="text-xs text-slate-400">{label}</p>
    <p className={`text-sm font-semibold ${valueClass}`}>{value}</p>
  </div>
}

function FlowItemRow({ item }: { item: any }) {
  const mensagem = relation(item.mensagem)
  const cobranca = relation(item.cobranca)
  const entidade = cobrancaEntity(cobranca)
  const status = String(mensagem?.status_operacional ?? mensagem?.status ?? item.status ?? '')
  const itemStatus = status || String(item.status ?? '')
  const falha = isFailureStatus(itemStatus)
  return <details className="group/item border-b border-slate-100 last:border-b-0">
    <summary className="list-none [&::-webkit-details-marker]:hidden">
      <div className="grid cursor-pointer gap-3 px-4 py-3 transition hover:bg-slate-50 md:grid-cols-[150px_minmax(260px,1fr)_minmax(180px,0.7fr)_190px_24px] md:items-center">
        <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${itemStatusClass(itemStatus)}`}>{MESSAGE_STATUS_LABEL[itemStatus] ?? itemStatus}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">{entidade.condominio}</p>
          <p className="mt-1 truncate text-xs text-slate-500">Unidade {entidade.unidade} · {entidade.responsavel}</p>
        </div>
        <p className="truncate text-sm text-slate-700">{mensagem?.destinatario || entidade.destinatario || 'Sem destinatário'}</p>
        <p className="text-sm text-slate-700">{formatDateTimeBR(mensagem?.agendada_para ?? mensagem?.scheduled_at ?? mensagem?.enviada_em ?? mensagem?.sent_at)}</p>
        <ChevronRight size={17} className="text-slate-400 transition group-open/item:rotate-90" />
      </div>
    </summary>
    <div className="grid gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <p className="font-medium text-slate-800">{falha ? 'Falha' : 'Detalhes'}</p>
        <p className="mt-1">{falha ? failureReason(item, mensagem) : item.motivo || 'Item registrado no Flow cobrança.'}</p>
      </div>
      {falha ? <form action={reenviarItemFlowCobranca.bind(null, item.id)}><PendingSubmitButton variant="secondary" pendingLabel="Reagendando..."><RefreshCcw size={15} />Reenviar</PendingSubmitButton></form> : null}
    </div>
  </details>
}
