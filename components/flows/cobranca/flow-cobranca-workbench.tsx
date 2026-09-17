'use client'

import { useActionState, useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ChevronRight, CirclePause, FileSignature, Play, RefreshCw, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { ListCollapsibleSectionHeader, ListEmptyState, ListPanel, ListRow, ListRows } from '@/components/layout/list-page'
import { Button } from '@/components/ui/button'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { cancelarFlowCobranca, criarFlowsCobranca, desfazerAtivacaoCobrancasFlowCobranca, enviarFlowCobranca, excluirFlowCobranca, pausarFlowCobranca, reenviarItemFlowCobranca } from '@/features/flows/cobranca/actions'
import { formatCurrency } from '@/utils/formatters/currency'
import { hasResponsavelVinculado } from '@/features/flows/cobranca/eligibilidade'
import { dividirCriacaoFlows, LIMITE_EMAILS_FLOW } from '@/features/flows/cobranca/dividir-criacao'
import { AtivacaoLoteFlows } from './ativacao-lote'

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

function groupByCondominio(cobrancas: any[]) {
  const groups = new Map<string, { condominioId: string; condominioNome: string; reguaId?: string; carteiraId: string; carteiraNome: string; rows: any[]; total: number }>()
  for (const cobranca of cobrancas) {
    const carteiraId = String(cobranca.carteira_id ?? '')
    const condominioId = String(cobranca.condominio_id ?? '')
    if (!carteiraId || !condominioId) continue
    const condominio = relation(cobranca.condominio)
    const current = groups.get(condominioId) ?? {
      condominioId,
      condominioNome: condominio?.nome_operacional || condominio?.nome || 'Condomínio',
      reguaId: condominio?.regua_cobranca_id,
      carteiraId,
      carteiraNome: relation(cobranca.carteira)?.nome ?? 'Carteira',
      rows: [],
      total: 0,
    }
    current.rows.push(cobranca)
    current.total += cobrancaValue(cobranca)
    groups.set(condominioId, current)
  }
  return Array.from(groups.values()).sort((a, b) => a.condominioNome.localeCompare(b.condominioNome, 'pt-BR'))
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
  const [selectedCondominio, setSelectedCondominio] = useState(() => disponibilidade.find(row => initialSelectedIds.includes(row.id))?.condominio_id ?? '')
  const router = useRouter()
  const [progresso, setProgresso] = useState('')
  const [flowsSelecionados, setFlowsSelecionados] = useState<string[]>([])
  const [ativandoLote, setAtivandoLote] = useState(false)
  const [openSteps, setOpenSteps] = useState<Record<StepId, boolean>>({
    lotes: initialStep === 'lotes' || disponibilidade.some(hasResponsavelVinculado),
    flows: initialStep === 'flows' || flows.length > 0,
  })
  const [createState, createAction, criando] = useActionState(async (_state: { error: string } | null, formData: FormData) => {
    let criados = 0
    try {
      const ids = new Set(formData.getAll('cobranca_id').map(String))
      const partes = dividirCriacaoFlows(disponibilidade.filter(row => ids.has(row.id)))
      if (!partes.length) return { error: 'Selecione um condomínio para criar os flows.' }
      for (let index = 0; index < partes.length; index += 1) {
        setProgresso(`Criando parte ${index + 1} de ${partes.length} · ${criados} flow(s) pronto(s)`)
        const parte = new FormData()
        for (const [key, value] of formData.entries()) if (key.startsWith('regua_id:')) parte.set(key, value)
        for (const row of partes[index]) parte.append('cobranca_id', row.id)
        const resultado = await criarFlowsCobranca(null, parte)
        if (resultado.error) throw new Error(resultado.error)
        criados += resultado.flowIds?.length ?? 0
      }
      setProgresso(`${criados} flow(s) criado(s).`)
      setOpenSteps(current => ({ ...current, flows: true }))
      router.refresh()
      return null
    } catch (error) {
      setProgresso('')
      router.refresh()
      return { error: `${criados ? `${criados} flow(s) já criado(s) foram preservados. ` : ''}${error instanceof Error ? error.message : 'A criação foi interrompida. Atualize a lista antes de continuar.'}` }
    }
  }, null)
  const elegiveis = useMemo(() => disponibilidade.filter(hasResponsavelVinculado), [disponibilidade])
  const semResponsavel = disponibilidade.length - elegiveis.length
  const selectedCobrancas = useMemo(() => elegiveis.filter((cobranca) => cobranca.condominio_id === selectedCondominio), [elegiveis, selectedCondominio])
  const selected = selectedCobrancas.map(row => row.id)
  const plano = useMemo(() => {
    try { return { quantidade: dividirCriacaoFlows(selectedCobrancas).length, error: '' } }
    catch (error) { return { quantidade: 0, error: error instanceof Error ? error.message : 'Revise o período selecionado.' } }
  }, [selectedCobrancas])
  const grupos = useMemo(() => groupByCondominio(selectedCobrancas), [selectedCobrancas])
  const gruposDisponiveis = useMemo(() => groupByCondominio(elegiveis), [elegiveis])

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
    setSelectedCondominio(rows[0]?.condominio_id ?? '')
  }

  return <div className="space-y-3">
    {progresso ? <p role="status" aria-live="polite" className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{progresso}</p> : null}
    {createState?.error ? <p role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">{createState.error}</p> : null}
    <ListPanel>
      <details open={openSteps.lotes} onToggle={(event) => syncStepOpen('lotes', event)} className="group bg-white">
        <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <ListCollapsibleSectionHeader title="Condomínio + régua" count={gruposDisponiveis.length} />
        </summary>
        {gruposDisponiveis.length ? <form action={createAction}>
          {selectedCobrancas.map((cobranca) => <input key={cobranca.id} type="hidden" name="cobranca_id" value={cobranca.id} />)}
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm text-slate-600">Selecione um condomínio por Flow. Serão incluídas as {selectedCobrancas.length} cobrança(s) elegíveis desse condomínio exibidas pelo filtro.</p>
              <p className="mt-1 text-xs text-slate-500">Criação automática em partes menores, com até {LIMITE_EMAILS_FLOW} e-mails por Flow. As cobranças da mesma unidade ficam juntas. Mantenha esta página aberta até concluir.</p>
              {semResponsavel > 0 ? <p className="mt-1 text-xs text-amber-800">{semResponsavel} cobrança(s) sem responsável não entram na seleção. Preencha o responsável no cadastro da unidade para incluí-las no Flow.</p> : null}
            </div>
          </div>
          <ListRows>
            {gruposDisponiveis.map((grupo) => {
              const elegiveisNoGrupo = grupo.rows.filter(hasResponsavelVinculado)
              const pendenciasPorCondominio = new Map<string, { nome: string; quantidade: number }>()
              for (const row of grupo.rows.filter((row) => !hasResponsavelVinculado(row))) {
                const condominio = relation(row.condominio)
                const id = row.condominio_id || condominio?.id || 'sem-condominio'
                const pendencia = pendenciasPorCondominio.get(id) ?? {
                  nome: condominio?.nome_operacional || condominio?.nome || 'Condomínio não informado',
                  quantidade: 0,
                }
                pendencia.quantidade += 1
                pendenciasPorCondominio.set(id, pendencia)
              }
              const selecionadasNoGrupo = elegiveisNoGrupo.filter((row) => selected.includes(row.id))
              const grupoSelecionado = elegiveisNoGrupo.length > 0 && selecionadasNoGrupo.length === elegiveisNoGrupo.length
              const opcoesRegua = reguas.filter((regua: any) => !regua.carteira_id || regua.carteira_id === grupo.carteiraId)
              const reguasDaCarteira = opcoesRegua.filter((regua: any) => regua.carteira_id === grupo.carteiraId)
              const defaultRegua = reguasDaCarteira.find((regua: any) => regua.id === grupo.reguaId)?.id
                ?? reguasDaCarteira[0]?.id
                ?? opcoesRegua.find((regua: any) => regua.id === grupo.reguaId)?.id
                ?? opcoesRegua[0]?.id
                ?? ''
              return <ListRow key={grupo.condominioId} className="bg-white lg:grid-cols-[minmax(260px,1fr)_140px_150px_minmax(260px,1fr)]">
                <div>
                  <label className="inline-flex items-center gap-3 text-sm font-semibold text-slate-950"><input type="radio" name="condominio_selecionado" value={grupo.condominioId} checked={grupoSelecionado} disabled={criando || elegiveisNoGrupo.length === 0} onChange={() => toggleGrupo(grupo.rows)} className="h-4 w-4 border-slate-300 text-[var(--gkli-primary)]" />{grupo.condominioNome}</label>
                  <p className="mt-1 text-xs text-slate-500">{grupo.carteiraNome}</p>
                  <p className="mt-1 text-xs text-slate-500">{selecionadasNoGrupo.length} de {elegiveisNoGrupo.length} cobrança(s) selecionada(s)</p>
                  <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer">Ver cobranças incluídas pelo filtro ({grupo.rows.length})</summary><ul className="mt-2 space-y-2">{grupo.rows.map(row => <li key={row.id}><a href={`/app/cobrancas/${row.id}`} className="underline">Unidade {relation(row.unidade)?.identificacao || '-'} · {row.vencimento} · {formatCurrency(cobrancaValue(row))}</a></li>)}</ul></details>
                  {grupo.rows.length > elegiveisNoGrupo.length ? <p className="mt-1 text-xs text-amber-800">{grupo.rows.length - elegiveisNoGrupo.length} sem responsável</p> : null}
                  {pendenciasPorCondominio.size > 0 ? <ul className="mt-1 space-y-1 text-xs text-amber-800" aria-label="Cobranças sem responsável por condomínio">
                    {Array.from(pendenciasPorCondominio.entries()).sort(([, a], [, b]) => a.nome.localeCompare(b.nome, 'pt-BR')).map(([id, pendencia]) => <li key={id}>{pendencia.nome}: {pendencia.quantidade} cobrança(s) sem responsável</li>)}
                  </ul> : null}
                </div>
                <div><p className="text-xs text-slate-400">Total selecionado</p><p className="text-sm font-medium text-slate-800">{formatCurrency(selecionadasNoGrupo.reduce((sum, row) => sum + cobrancaValue(row), 0))}</p></div>
                <div><p className="text-xs text-slate-400">Lotes</p><p className="text-sm text-slate-700">{selecionadasNoGrupo.length ? `${plano.quantidade} parte(s)` : 'Não selecionado'}</p></div>
                <label className="text-xs font-medium text-slate-600">
                  Régua do Flow
                  <select name={`regua_id:${grupo.carteiraId}`} required={selecionadasNoGrupo.length > 0} disabled={criando || selecionadasNoGrupo.length === 0} defaultValue={defaultRegua} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-400">
                    <option value="" disabled>Selecione</option>
                    {opcoesRegua.map((regua: any) => <option key={regua.id} value={regua.id}>{regua.nome}{regua.carteira_id ? '' : ' · global'}</option>)}
                  </select>
                </label>
              </ListRow>
            })}
          </ListRows>
          {plano.error ? <p role="alert" className="px-4 py-3 text-sm text-rose-800">{plano.error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
            <PendingSubmitButton formAction={desfazerAtivacaoCobrancasFlowCobranca} formNoValidate variant="danger" disabled={criando || selectedCobrancas.length === 0} pendingLabel="Desfazendo..." onClick={(event) => { if (!window.confirm(`Devolver ${selectedCobrancas.length} cobrança(s) para Novas?`)) event.preventDefault() }}><RotateCcw size={16} />Desfazer ativação</PendingSubmitButton>
            <PendingSubmitButton disabled={criando || !plano.quantidade || Boolean(plano.error)} pendingLabel="Criando flows..." onClick={(event) => { if (!window.confirm(`Criar ${plano.quantidade} Flow(s) em partes, com até ${LIMITE_EMAILS_FLOW} e-mails cada?`)) event.preventDefault() }}><CheckCircle2 size={16} />Criar Flow</PendingSubmitButton>
          </div>
        </form> : <ListEmptyState title="Nenhum condomínio disponível" description="Selecione um condomínio em Cobranças novas e ative suas cobranças para montar o Flow." />}
      </details>
    </ListPanel>

    <ListPanel>
      <details open={openSteps.flows} onToggle={(event) => syncStepOpen('flows', event)} className="group bg-white">
        <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <ListCollapsibleSectionHeader title="Flows" count={flows.length} />
        </summary>
        {flows.length ? <>
          <AtivacaoLoteFlows flows={flows} selected={flowsSelecionados} onSelectedChange={setFlowsSelecionados} onBusyChange={setAtivandoLote} />
          <fieldset disabled={ativandoLote} className="min-w-0">
            <FlowsAgrupados flows={flows} renderFlow={(flow: any) => <div key={flow.id} className="flex items-start gap-1">
              {flow.status === 'pronto' && Number(flow.total_mensagens) > 0 ? <label className="shrink-0 py-6 pl-4">
                <input type="checkbox" aria-label={`Selecionar ${flow.nome}`} checked={flowsSelecionados.includes(flow.id)} onChange={event => setFlowsSelecionados(current => event.target.checked ? [...current, flow.id] : current.filter(id => id !== flow.id))} />
              </label> : null}
              <div className="min-w-0 flex-1"><FlowRow flow={flow} /></div>
            </div>} />
          </fieldset>
        </> : <ListEmptyState title="Nenhum Flow criado ainda" description="Depois de criar um Flow, ele aparecerá aqui para envio e monitoramento." />}
      </details>
    </ListPanel>
  </div>
}

export function FlowCobrancaHistorico({ flows }: { flows: any[] }) {
  return <ListPanel>
    <ListCollapsibleSectionHeader title="Flows concluídos" count={flows.length} />
    {flows.length
      ? <FlowsAgrupados flows={flows} renderFlow={flow => <FlowRow key={flow.id} flow={flow} />} />
      : <ListEmptyState title="Nenhum Flow concluído" description="Os flows concluídos aparecerão aqui, com o histórico e os detalhes dos envios." />}
  </ListPanel>
}

function FlowsAgrupados({ flows, renderFlow }: { flows: any[]; renderFlow: (flow: any) => ReactNode }) {
  const carteiras = new Map<string, { nome: string; flows: any[]; condominios: Map<string, { nome: string; flows: any[] }> }>()
  for (const flow of flows) {
    const carteiraId = flow.carteira_id || 'sem-carteira'
    if (!carteiras.has(carteiraId)) carteiras.set(carteiraId, { nome: relation(flow.carteira)?.nome || 'Sem carteira', flows: [], condominios: new Map() })
    const carteira = carteiras.get(carteiraId)!
    carteira.flows.push(flow)
    const condominioId = flow.payload?.condominio_id || 'sem-condominio'
    const condominio = relation(flow.condominio)
    if (!carteira.condominios.has(condominioId)) carteira.condominios.set(condominioId, { nome: condominio?.nome_operacional || condominio?.nome || 'Condomínio não informado', flows: [] })
    carteira.condominios.get(condominioId)!.flows.push(flow)
  }
  const resumo = (rows: any[]) => {
    const total = (campo: string) => rows.reduce((sum, flow) => sum + n(flow[campo]), 0)
    return `${rows.length} flows · ${total('total_pendentes')} pendentes · ${total('total_agendadas')} agendadas · ${total('total_enviadas')} enviadas · ${total('total_falhas')} falhas`
  }
  return <div className="space-y-3 p-3">{[...carteiras.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome, 'pt-BR')).map(([id, carteira]) =>
    <details key={id} open className="overflow-hidden rounded-lg border border-slate-200">
      <summary className="cursor-pointer bg-slate-100 px-4 py-3 text-sm font-semibold">
        {carteira.nome}<span className="mt-1 block text-xs font-normal text-slate-600">{carteira.condominios.size} condomínio(s) · {resumo(carteira.flows)}</span>
      </summary>
      <div className="space-y-2 p-2">{[...carteira.condominios.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome, 'pt-BR')).map(([condominioId, condominio]) =>
        <details key={condominioId} className="overflow-hidden rounded-lg border border-slate-100">
          <summary className="cursor-pointer bg-slate-50 px-4 py-3 text-sm font-medium">
            {condominio.nome}<span className="mt-1 block text-xs font-normal text-slate-500">{resumo(condominio.flows)}</span>
          </summary>
          <ListRows>{condominio.flows.map(renderFlow)}</ListRows>
        </details>)}</div>
    </details>)}</div>
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

  async function loadItens(force = false) {
    if ((!force && itensLoaded) || itensLoading) return
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
      await loadItens(true)
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
          <form action={enviarFlowCobranca.bind(null, flow.id)}><PendingSubmitButton pendingLabel={status === 'pausado' ? 'Retomando...' : 'Ativando...'}><Play size={16} />{status === 'pausado' ? 'Retomar Flow' : 'Ativar Flow'}</PendingSubmitButton></form>
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
          <p className="text-xs text-slate-500">Agenda automática: até 50 e-mails/dia por domínio, respeitando o limite da carteira, das 9h às 18h (Brasília), com intervalo mínimo de 10 minutos.</p>
        </div>
        <span className="text-xs text-slate-400">{counters.falhas ? `${counters.falhas} item(ns) com falha` : 'Sem falhas abertas'}</span>
      </div>
      {itensLoading || (!itensLoaded && !itensError) ? (
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
