'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, CirclePause, FileSignature, Play, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { ListEmptyState, ListPanel, ListPanelHeader, ListRow, ListRows, ListTitle } from '@/components/layout/list-page'
import { criarFlowsPreJuridico, cancelarFlowPreJuridico, enviarFlowPreJuridico, pausarFlowPreJuridico } from '@/features/pre-juridico/flow-actions'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'

type StepId = 'disponibilidade' | 'lotes' | 'flows'

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

function statusClass(status: string) {
  if (status === 'em_execucao') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'pronto') return 'border-sky-200 bg-sky-50 text-sky-700'
  if (status === 'pausado') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (status === 'concluido') return 'border-slate-200 bg-slate-50 text-slate-700'
  return 'border-rose-100 bg-rose-50 text-rose-700'
}

function formatDateTimeBR(value: string | null | undefined) {
  if (!value) return 'Sem agendamento'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value))
}

function caseValue(caso: any) {
  const cobrancas = Array.isArray(caso.cobrancas_unidade) ? caso.cobrancas_unidade : []
  if (cobrancas.length) return cobrancas.reduce((sum: number, item: any) => sum + Number(item.valor_atualizado ?? item.valor_original ?? 0), 0)
  const cobranca = relation(caso.cobranca)
  return Number(cobranca?.valor_atualizado ?? cobranca?.valor_original ?? 0)
}

function groupByCarteira(casos: any[]) {
  const groups = new Map<string, { carteiraId: string; carteiraNome: string; rows: any[]; total: number }>()
  for (const caso of casos) {
    const carteiraId = String(caso.carteira_id ?? '')
    if (!carteiraId) continue
    const current = groups.get(carteiraId) ?? {
      carteiraId,
      carteiraNome: relation(caso.carteira)?.nome ?? 'Carteira',
      rows: [],
      total: 0,
    }
    current.rows.push(caso)
    current.total += caseValue(caso)
    groups.set(carteiraId, current)
  }
  return Array.from(groups.values()).sort((a, b) => a.carteiraNome.localeCompare(b.carteiraNome, 'pt-BR'))
}

export function PreJuridicoFlowWorkbench({
  disponibilidade,
  reguas,
  flows,
  initialStep = 'disponibilidade',
}: {
  disponibilidade: any[]
  reguas: any[]
  flows: any[]
  initialStep?: StepId
}) {
  const [selected, setSelected] = useState<string[]>([])
  const selectedCasos = useMemo(() => disponibilidade.filter((caso) => selected.includes(caso.id)), [disponibilidade, selected])
  const grupos = useMemo(() => groupByCarteira(selectedCasos), [selectedCasos])

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  function setAll(checked: boolean) {
    setSelected(checked ? disponibilidade.map((caso) => caso.id) : [])
  }

  return <div className="space-y-3">
    <ListPanel>
      <details open={initialStep === 'disponibilidade' || disponibilidade.length > 0} className="group bg-white">
        <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <ListPanelHeader className="flex items-center justify-between gap-4 bg-white/80 group-hover:bg-slate-50">
            <ListTitle title="1. Disponibilidade" description="Procurações geradas e ainda sem lote/Flow." />
            <div className="flex shrink-0 items-center gap-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{disponibilidade.length}</span><ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" /></div>
          </ListPanelHeader>
        </summary>
        <div>
          {disponibilidade.length ? <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
            <p className="text-sm text-slate-600">{selected.length} procuração(ões) selecionada(s) para montar lote.</p>
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={selected.length > 0 && selected.length === disponibilidade.length} onChange={(event) => setAll(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Selecionar todas
            </label>
          </div> : null}
          {disponibilidade.length ? <ListRows>
          {disponibilidade.length ? disponibilidade.map((caso) => {
            const condominio = relation(caso.condominio)
            const unidade = relation(caso.unidade)
            const value = caseValue(caso)
            return <label key={caso.id} className="block">
              <ListRow className="cursor-pointer bg-white md:grid-cols-[28px_minmax(260px,1fr)_150px_150px_150px_24px]">
              <input type="checkbox" checked={selected.includes(caso.id)} onChange={() => toggle(caso.id)} className="h-4 w-4 rounded border-slate-300" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{condominio?.nome_operacional || condominio?.nome || 'Condomínio'} · Unidade {unidade?.identificacao || '-'}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{unidade?.responsavel_nome || 'Responsável não informado'} · {relation(caso.carteira)?.nome || 'Carteira'}</p>
              </div>
              <div><p className="text-xs text-slate-400">Valor</p><p className="text-sm font-medium text-slate-800">{formatCurrency(value)}</p></div>
              <div><p className="text-xs text-slate-400">Procuração</p><p className="text-sm text-emerald-700">Gerada</p></div>
              <div><p className="text-xs text-slate-400">Atualização</p><p className="text-sm text-slate-700">{formatDateBR(caso.updated_at)}</p></div>
              <ChevronRight size={17} className="text-slate-400" />
              </ListRow>
            </label>
          }) : null}
          </ListRows> : <ListEmptyState title="Nenhuma procuração disponível" description="Quando uma procuração for gerada no processamento, ela aparecerá aqui para montar o Flow." />}
        </div>
      </details>
    </ListPanel>

    <ListPanel>
      <details open={initialStep === 'lotes' || grupos.length > 0} className="group bg-white">
        <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <ListPanelHeader className="flex items-center justify-between gap-4 bg-white/80 group-hover:bg-slate-50">
            <ListTitle title="2. Lotes + Régua" description="Agrupamento por carteira com seleção da régua na linha do lote." />
            <div className="flex shrink-0 items-center gap-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{grupos.length}</span><ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" /></div>
          </ListPanelHeader>
        </summary>
      <form action={criarFlowsPreJuridico} onSubmit={(event) => { if (!window.confirm(`Criar ${grupos.length} Flow(s) pré-jurídico(s)?`)) event.preventDefault() }}>
        {selected.map((id) => <input key={id} type="hidden" name="caso_id" value={id} />)}
        <div>
          {grupos.length ? <ListRows>
            {grupos.length ? grupos.map((grupo) => {
              const opcoesRegua = reguas.filter((regua: any) => !regua.carteira_id || regua.carteira_id === grupo.carteiraId)
              const defaultRegua = opcoesRegua.find((regua: any) => regua.carteira_id === grupo.carteiraId)?.id ?? opcoesRegua[0]?.id ?? ''
              return <ListRow key={grupo.carteiraId} className="bg-white lg:grid-cols-[minmax(260px,1fr)_140px_150px_minmax(260px,1fr)]">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{grupo.carteiraNome}</p>
                  <p className="mt-1 text-xs text-slate-500">{grupo.rows.length} caso(s) selecionado(s)</p>
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
            }) : null}
          </ListRows> : <ListEmptyState title="Nenhum lote montado" description="Selecione as procurações disponíveis na etapa anterior para agrupar por carteira." />}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
            <Button type="button" variant="secondary" disabled={!selected.length}>Selecionadas: {selected.length}</Button>
            <PendingSubmitButton disabled={!grupos.length} pendingLabel="Criando flows..."><CheckCircle2 size={16} />Criar Flow</PendingSubmitButton>
          </div>
        </div>
      </form>
      </details>
    </ListPanel>

    <ListPanel>
      <details open={initialStep === 'flows' || flows.length > 0} className="group bg-white">
        <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <ListPanelHeader className="flex items-center justify-between gap-4 bg-white/80 group-hover:bg-slate-50">
            <ListTitle title="3. Flows" description="Envio, pausa, cancelamento e acompanhamento do próximo disparo." />
            <div className="flex shrink-0 items-center gap-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{flows.length}</span><ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" /></div>
          </ListPanelHeader>
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
  const lote = relation(flow.lote)
  return <details className="group/flow">
    <summary className="list-none [&::-webkit-details-marker]:hidden">
      <ListRow className="cursor-pointer bg-white lg:grid-cols-[minmax(280px,1fr)_130px_150px_160px_220px_20px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(status)}`}>{FLOW_STATUS_LABEL[status] ?? status}</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600"><FileSignature size={13} />{n(flow.total_mensagens)} mensagens</span>
        </div>
        <p className="mt-2 truncate text-sm font-semibold text-slate-950">{flow.nome}</p>
        <p className="mt-1 truncate text-xs text-slate-500">{carteira?.nome || 'Carteira'} · {regua?.nome || 'Régua'}</p>
      </div>
      <Metric label="Pendentes" value={flow.total_pendentes} />
      <Metric label="Agendadas" value={flow.total_agendadas} />
      <Metric label="Enviadas" value={flow.total_enviadas} />
      <div><p className="text-xs text-slate-400">Próximo disparo</p><p className="text-sm text-slate-700">{formatDateTimeBR(flow.proximo_disparo_em)}</p></div>
      <ChevronRight size={17} className="text-slate-400 transition group-open/flow:rotate-90" />
      </ListRow>
    </summary>
    <div className="grid gap-4 border-t border-slate-100 bg-slate-50/60 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Falhas" value={flow.total_falhas} />
        <Metric label="Criado em" value={formatDateBR(flow.created_at)} />
        <Metric label="Lote" value={lote?.status ? `Status ${lote.status}` : 'Sem status'} />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Link href={`/app/lotes/${flow.lote_id}?pre_juridico=1`} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">
          Abrir lote
        </Link>
        {status === 'pronto' || status === 'pausado' ? (
          <form action={enviarFlowPreJuridico.bind(null, flow.id)}><PendingSubmitButton pendingLabel={status === 'pausado' ? 'Retomando...' : 'Enviando...'}><Play size={16} />{status === 'pausado' ? 'Retomar' : 'Enviar'}</PendingSubmitButton></form>
        ) : null}
        {status === 'em_execucao' ? (
          <form action={pausarFlowPreJuridico.bind(null, flow.id)}><PendingSubmitButton variant="secondary" pendingLabel="Pausando..."><CirclePause size={16} />Pausar</PendingSubmitButton></form>
        ) : null}
        {!['cancelado', 'concluido', 'concluido_com_falhas'].includes(status) ? (
          <form action={cancelarFlowPreJuridico.bind(null, flow.id)} onSubmit={(event) => { if (!window.confirm('Cancelar este Flow e os disparos pendentes?')) event.preventDefault() }}><PendingSubmitButton variant="secondary" pendingLabel="Cancelando..."><XCircle size={16} />Cancelar</PendingSubmitButton></form>
        ) : null}
      </div>
    </div>
  </details>
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return <div><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-sm font-medium text-slate-800">{String(value ?? 0)}</p></div>
}
