'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, CirclePause, FileSignature, Play, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
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
  const [step, setStep] = useState<StepId>(initialStep)
  const [selected, setSelected] = useState<string[]>([])
  const selectedCasos = useMemo(() => disponibilidade.filter((caso) => selected.includes(caso.id)), [disponibilidade, selected])
  const grupos = useMemo(() => groupByCarteira(selectedCasos), [selectedCasos])

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  function setAll(checked: boolean) {
    setSelected(checked ? disponibilidade.map((caso) => caso.id) : [])
  }

  return <div className="space-y-4">
    <Card className="p-4">
      <div className="grid gap-2 md:grid-cols-3">
        <StepButton active={step === 'disponibilidade'} onClick={() => setStep('disponibilidade')} title="1. Disponibilidade" detail={`${disponibilidade.length} procuração(ões) geradas`} />
        <StepButton active={step === 'lotes'} onClick={() => setStep('lotes')} title="2. Lotes + Régua" detail={`${grupos.length} lote(s) por carteira`} />
        <StepButton active={step === 'flows'} onClick={() => setStep('flows')} title="3. Flows" detail={`${flows.length} flow(s) monitorados`} />
      </div>
    </Card>

    {step === 'disponibilidade' ? (
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Procurações disponíveis</h2>
            <p className="mt-1 text-sm text-slate-500">Casos com procuração gerada e ainda sem lote/Flow.</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={selected.length > 0 && selected.length === disponibilidade.length} onChange={(event) => setAll(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Selecionar todas
          </label>
        </div>
        <div className="divide-y divide-slate-100">
          {disponibilidade.length ? disponibilidade.map((caso) => {
            const condominio = relation(caso.condominio)
            const unidade = relation(caso.unidade)
            const value = caseValue(caso)
            return <label key={caso.id} className="grid cursor-pointer gap-3 px-5 py-4 transition hover:bg-slate-50 md:grid-cols-[28px_minmax(260px,1fr)_150px_160px_120px] md:items-center">
              <input type="checkbox" checked={selected.includes(caso.id)} onChange={() => toggle(caso.id)} className="h-4 w-4 rounded border-slate-300" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{condominio?.nome_operacional || condominio?.nome || 'Condomínio'} · Unidade {unidade?.identificacao || '-'}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{unidade?.responsavel_nome || 'Responsável não informado'} · {relation(caso.carteira)?.nome || 'Carteira'}</p>
              </div>
              <div><p className="text-xs text-slate-400">Valor</p><p className="text-sm font-medium text-slate-800">{formatCurrency(value)}</p></div>
              <div><p className="text-xs text-slate-400">Procuração</p><p className="text-sm text-emerald-700">Gerada</p></div>
              <div><p className="text-xs text-slate-400">Atualização</p><p className="text-sm text-slate-700">{formatDateBR(caso.updated_at)}</p></div>
            </label>
          }) : <div className="px-5 py-10 text-center text-sm text-slate-500">Nenhuma procuração gerada aguardando Flow.</div>}
        </div>
        <div className="flex justify-end border-t border-slate-100 px-5 py-4">
          <Button type="button" disabled={!selected.length} onClick={() => setStep('lotes')}>Montar lotes</Button>
        </div>
      </Card>
    ) : null}

    {step === 'lotes' ? (
      <form action={criarFlowsPreJuridico} onSubmit={(event) => { if (!window.confirm(`Criar ${grupos.length} Flow(s) pré-jurídico(s)?`)) event.preventDefault() }}>
        {selected.map((id) => <input key={id} type="hidden" name="caso_id" value={id} />)}
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Lotes por carteira</h2>
            <p className="mt-1 text-sm text-slate-500">Cada linha vira um lote e um Flow com a régua selecionada.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {grupos.length ? grupos.map((grupo) => {
              const opcoesRegua = reguas.filter((regua: any) => !regua.carteira_id || regua.carteira_id === grupo.carteiraId)
              const defaultRegua = opcoesRegua.find((regua: any) => regua.carteira_id === grupo.carteiraId)?.id ?? opcoesRegua[0]?.id ?? ''
              return <div key={grupo.carteiraId} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(260px,1fr)_140px_150px_minmax(260px,1fr)] lg:items-center">
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
              </div>
            }) : <div className="px-5 py-10 text-center text-sm text-slate-500">Selecione procurações na etapa anterior.</div>}
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
            <Button type="button" variant="secondary" onClick={() => setStep('disponibilidade')}>Voltar</Button>
            <PendingSubmitButton disabled={!grupos.length} pendingLabel="Criando flows..."><CheckCircle2 size={16} />Criar Flow</PendingSubmitButton>
          </div>
        </Card>
      </form>
    ) : null}

    {step === 'flows' ? (
      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Flows pré-jurídicos</h2>
          <p className="mt-1 text-sm text-slate-500">Envie, pause, cancele e acompanhe o próximo disparo.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {flows.length ? flows.map((flow: any) => <FlowRow key={flow.id} flow={flow} />) : <div className="px-5 py-10 text-center text-sm text-slate-500">Nenhum Flow criado ainda.</div>}
        </div>
      </Card>
    ) : null}
  </div>
}

function StepButton({ active, onClick, title, detail }: { active: boolean; onClick: () => void; title: string; detail: string }) {
  return <button type="button" onClick={onClick} className={`rounded-lg border px-4 py-3 text-left transition ${active ? 'border-[#04799a] bg-[#edf8fb] text-[#035f7b]' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
    <p className="text-sm font-semibold">{title}</p>
    <p className="mt-1 text-xs opacity-80">{detail}</p>
  </button>
}

function FlowRow({ flow }: { flow: any }) {
  const status = String(flow.status ?? 'pronto')
  const carteira = relation(flow.carteira)
  const regua = relation(flow.regua)
  const lote = relation(flow.lote)
  return <details className="group">
    <summary className="grid cursor-pointer list-none gap-3 px-5 py-4 transition hover:bg-slate-50 lg:grid-cols-[minmax(280px,1fr)_130px_150px_160px_220px_20px] lg:items-center [&::-webkit-details-marker]:hidden">
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
      <ChevronDown size={17} className="text-slate-400 transition group-open:rotate-180" />
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
