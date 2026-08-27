import Link from 'next/link'
import { AlertCircle, CalendarClock, CheckCircle2, RadioTower } from 'lucide-react'
import { ListEmptyState, ListKpiGrid, ListPage, ListPanel, ListPanelHeader, ListRow, ListRows, ListTitle } from '@/components/layout/list-page'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { getPreJuridicoFlowPageData } from '@/features/pre-juridico/flow-queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

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

function formatDateTimeBR(value: string | null | undefined) {
  if (!value) return 'Sem agenda'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value))
}

function flowStatusClass(status: string) {
  if (status === 'em_execucao') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'pronto') return 'border-sky-200 bg-sky-50 text-sky-700'
  if (status === 'pausado') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (status === 'concluido') return 'border-slate-200 bg-slate-50 text-slate-700'
  return 'border-rose-100 bg-rose-50 text-rose-700'
}

function messageStatusClass(status: string) {
  if (['agendada', 'enviada', 'aprovada'].includes(status)) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (['pendente_aprovacao'].includes(status)) return 'border-sky-200 bg-sky-50 text-sky-700'
  if (['falha', 'cancelada'].includes(status)) return 'border-rose-100 bg-rose-50 text-rose-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function itemEntity(item: any) {
  const cobranca = relation(item.cobranca)
  const acordo = relation(item.acordo)
  const origem = cobranca ?? acordo ?? {}
  const unidade = relation(origem.unidade)
  const condominio = relation(unidade?.condominio)
  return {
    condominio: condominio?.nome_operacional || condominio?.nome || 'Condomínio',
    unidade: unidade?.identificacao || '-',
    responsavel: unidade?.responsavel_nome || 'Responsável não informado',
  }
}

function flowCounters(flow: any) {
  return {
    pendentes: n(flow.total_pendentes),
    agendadas: n(flow.total_agendadas),
    enviadas: n(flow.total_enviadas),
    falhas: n(flow.total_falhas),
    mensagens: n(flow.total_mensagens),
  }
}

export default async function MonitorPreJuridicoPage() {
  const scope = await getPermittedCarteiras()
  const data = await getPreJuridicoFlowPageData(scope)
  const flows = data.flows as any[]
  const agendadas = flows.reduce((sum, flow) => sum + n(flow.total_agendadas), 0)
  const enviadas = flows.reduce((sum, flow) => sum + n(flow.total_enviadas), 0)
  const falhas = flows.reduce((sum, flow) => sum + n(flow.total_falhas), 0)
  const flowsComAgenda = flows.filter((flow) => n(flow.total_agendadas) > 0 || n(flow.total_enviadas) > 0 || n(flow.total_falhas) > 0)

  const enviosAgendados = flows
    .flatMap((flow) => (Array.isArray(flow.itens) ? flow.itens : []).map((item: any) => ({ flow, item, mensagem: relation(item.mensagem) })))
    .filter(({ mensagem }) => String(mensagem?.status_operacional ?? mensagem?.status ?? '') === 'agendada')
    .map((row) => ({ ...row, agenda: row.mensagem?.agendada_para ?? row.mensagem?.scheduled_at }))
    .filter((row) => row.agenda)
    .sort((a, b) => String(a.agenda).localeCompare(String(b.agenda)))
    .slice(0, 12)

  return (
    <ListPage>
      <PageHeader
        eyebrow="Pré-Jurídico"
        title="Monitor de envios agendados"
        description="Acompanhe os disparos programados pelos Flows do pré-jurídico, com agenda, enviados e falhas."
        actions={<div className="flex flex-wrap gap-2">
          <ButtonLink href="/app/pre-juridico/flow?step=flows" variant="header"><RadioTower size={16} />Abrir Flow</ButtonLink>
        </div>}
      />

      <ListKpiGrid>
        <KpiCard label="Envios agendados" value={agendadas} icon={<CalendarClock size={18} />} tone="bg-[#edf8fb] text-[#04799a]" />
        <KpiCard label="Flows com agenda" value={flowsComAgenda.length} icon={<RadioTower size={18} />} tone="bg-violet-50 text-violet-700" />
        <KpiCard label="Enviadas" value={enviadas} icon={<CheckCircle2 size={18} />} tone="bg-emerald-50 text-emerald-700" />
        <KpiCard label="Falhas" value={falhas} icon={<AlertCircle size={18} />} tone="bg-rose-50 text-rose-700" />
      </ListKpiGrid>

      <ListPanel>
        <ListPanelHeader className="flex items-center justify-between gap-4">
          <ListTitle title="Agenda de disparos" description="Envios programados e ainda não executados pelo Flow pré-jurídico." />
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{enviosAgendados.length}</span>
        </ListPanelHeader>
        {enviosAgendados.length ? (
          <ListRows>
            {enviosAgendados.map(({ flow, item, mensagem, agenda }) => {
              const entity = itemEntity(item)
              return (
                <ListRow key={`${flow.id}:${item.id}`} className="bg-white lg:grid-cols-[150px_minmax(280px,1fr)_minmax(220px,0.9fr)_160px_150px]">
                  <span className="inline-flex w-fit rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Agendada</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{entity.condominio}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">Unidade {entity.unidade} · {entity.responsavel}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{mensagem?.email_destinatario || mensagem?.destinatario || 'Destino não informado'}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{flow.nome}</p>
                  </div>
                  <Metric label="Agenda" value={formatDateTimeBR(agenda)} />
                  <Link href="/app/pre-juridico/flow?step=flows" className="text-sm font-medium text-[var(--gkli-primary)] hover:underline">Abrir Flow</Link>
                </ListRow>
              )
            })}
          </ListRows>
        ) : (
          <ListEmptyState title="Nenhum envio agendado" description="Quando um Flow for enviado, os disparos programados aparecerão aqui." />
        )}
      </ListPanel>

      <ListPanel>
        <ListPanelHeader className="flex items-center justify-between gap-4">
          <ListTitle title="Resumo por Flow" description="Acompanhamento dos envios agendados, enviados e falhados por Flow." />
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{flowsComAgenda.length}</span>
        </ListPanelHeader>
        {flowsComAgenda.length ? (
          <ListRows>
            {flowsComAgenda.map((flow) => <FlowMonitorRow key={flow.id} flow={flow} />)}
          </ListRows>
        ) : (
          <ListEmptyState title="Nenhum Flow com envios" description="Quando um Flow tiver envios agendados, enviados ou falhados, ele aparecerá aqui." />
        )}
      </ListPanel>
    </ListPage>
  )
}

function FlowMonitorRow({ flow }: { flow: any }) {
  const status = String(flow.status ?? 'pronto')
  const counters = flowCounters(flow)
  const regua = relation(flow.regua)
  const itens = Array.isArray(flow.itens) ? flow.itens : []
  const open = counters.falhas > 0 || status === 'em_execucao'

  return (
    <details className="group/monitor bg-white" open={open}>
      <summary className="list-none [&::-webkit-details-marker]:hidden">
        <ListRow className="cursor-pointer bg-white lg:grid-cols-[minmax(300px,1fr)_130px_120px_120px_120px_190px_120px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${flowStatusClass(status)}`}>{FLOW_STATUS_LABEL[status] ?? status}</span>
            </div>
            <p className="mt-2 truncate text-sm font-semibold text-slate-950">{flow.nome}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{regua?.nome || 'Régua'} · Lote {String(flow.lote_id ?? '').slice(0, 8)}</p>
          </div>
          <Metric label="Mensagens" value={counters.mensagens} />
          <Metric label="Pendentes" value={counters.pendentes} />
          <Metric label="Agendadas" value={counters.agendadas} />
          <Metric label="Enviadas" value={counters.enviadas} />
          <Metric label="Próximo disparo" value={formatDateTimeBR(flow.proximo_disparo_em)} />
          <Link href="/app/pre-juridico/flow?step=flows" className="text-sm font-medium text-[var(--gkli-primary)] hover:underline">Abrir Flow</Link>
        </ListRow>
      </summary>
      <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">Itens monitorados</p>
            <p className="mt-0.5 text-xs text-slate-500">{itens.length} item(ns) vinculados a este Flow.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 size={14} className="text-emerald-600" />
            {counters.enviadas} enviada(s)
            {counters.falhas ? <span className="font-semibold text-rose-700">· {counters.falhas} falha(s)</span> : null}
          </div>
        </div>
        {itens.length ? (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {itens.map((item: any) => <FlowMonitorItem key={item.id} item={item} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Nenhum item localizado para este Flow.</div>
        )}
      </div>
    </details>
  )
}

function FlowMonitorItem({ item }: { item: any }) {
  const entity = itemEntity(item)
  const mensagem = relation(item.mensagem)
  const status = String(mensagem?.status_operacional ?? mensagem?.status ?? item.status ?? 'criado')
  const statusLabel = MESSAGE_STATUS_LABEL[status] ?? status
  const agenda = mensagem?.agendada_para ?? mensagem?.scheduled_at ?? mensagem?.enviada_em ?? mensagem?.sent_at

  return (
    <div className="grid gap-3 px-4 py-3 lg:grid-cols-[130px_minmax(260px,1fr)_minmax(220px,0.9fr)_170px] lg:items-center">
      <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${messageStatusClass(status)}`}>{statusLabel}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">{entity.condominio}</p>
        <p className="mt-1 truncate text-xs text-slate-500">Unidade {entity.unidade} · {entity.responsavel}</p>
      </div>
      <p className="truncate text-sm font-medium text-slate-800">{mensagem?.email_destinatario || mensagem?.destinatario || 'Destino não informado'}</p>
      <Metric label={status === 'enviada' ? 'Enviado em' : 'Agenda'} value={formatDateTimeBR(agenda)} danger={status === 'falha'} />
    </div>
  )
}

function KpiCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  return (
    <Card className="relative overflow-hidden p-3">
      <div className={`absolute right-4 top-3 rounded-lg p-2 ${tone}`}>{icon}</div>
      <p className="text-xs font-medium uppercase text-slate-400">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-slate-950">{value}</p>
    </Card>
  )
}

function Metric({ label, value, danger = false }: { label: string; value: unknown; danger?: boolean }) {
  const text = String(value ?? 0)
  return <div><p className="text-xs text-slate-400">{label}</p><p className={`mt-1 text-sm font-medium ${danger ? 'text-rose-700' : 'text-slate-800'}`}>{text}</p></div>
}
