import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { EmptyState } from '@/components/data/empty-state'
import {
  ClearFiltersLink,
  ListFilterField,
  ListFiltersForm,
  ListSearchField,
  ListTitle,
  ListTitleBar,
} from '@/components/layout/list-page'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listMensageriaLogs } from '@/features/mensageria/queries'

type MensageriaLogPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function getParam(value: string | string[] | undefined) {
  return String(Array.isArray(value) ? value[0] : value ?? '').trim()
}

function normalizeText(value: unknown) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function uniqueValues(rows: any[], field: string) {
  return [...new Set(rows.map((row) => String(row[field] ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

function formatDateTimeBR(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function eventLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    email_enviado: 'E-mail enviado',
    email_erro: 'Falha no e-mail',
    lote_aprovado: 'Lote aprovado',
    lote_cancelado: 'Lote cancelado',
    lote_envio_email_executado: 'Envio de lote',
    lote_falhas_reprocessadas: 'Falhas reprocessadas',
    lote_item_aprovado: 'Item aprovado',
    lote_item_cancelado: 'Item cancelado',
    mensagem_aprovada: 'Mensagem aprovada',
    mensagem_cancelada: 'Mensagem cancelada',
    mensagem_editada_revisao_lote: 'Mensagem editada',
    retorno_manual_registrado: 'Retorno manual',
    whatsapp_web_enviado_manual: 'WhatsApp manual',
  }

  const key = String(value ?? '')
  return labels[key] ?? key.replaceAll('_', ' ')
}

function eventTone(value: string | null | undefined) {
  const event = String(value ?? '')
  if (event.includes('erro') || event.includes('cancelado')) return 'border-rose-200 bg-rose-50 text-rose-700'
  if (event.includes('enviado') || event.includes('aprovado')) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (event.includes('reprocess')) return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-sky-200 bg-sky-50 text-sky-700'
}

function dateOnly(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function matchesLog(log: any, filters: Record<string, string>) {
  const q = normalizeText(filters.q)
  const haystack = normalizeText([
    log.evento,
    eventLabel(log.evento),
    log.descricao,
    log.lote_id,
    log.lote_item_id,
    log.mensagem_id,
  ].filter(Boolean).join(' '))
  const createdAt = dateOnly(log.created_at)

  if (q && !haystack.includes(q)) return false
  if (filters.evento && log.evento !== filters.evento) return false
  if (filters.status_anterior && log.status_anterior !== filters.status_anterior) return false
  if (filters.status_novo && log.status_novo !== filters.status_novo) return false
  if (filters.data_inicio && createdAt && createdAt < filters.data_inicio) return false
  if (filters.data_fim && createdAt && createdAt > filters.data_fim) return false
  return true
}

export default async function MensageriaLogPage({ searchParams }: MensageriaLogPageProps) {
  const params = searchParams ? await searchParams : {}
  const scope = await getPermittedCarteiras()
  const logsBase = await listMensageriaLogs(scope)
  const filters = {
    q: getParam(params.q),
    evento: getParam(params.evento),
    status_anterior: getParam(params.status_anterior),
    status_novo: getParam(params.status_novo),
    data_inicio: getParam(params.data_inicio),
    data_fim: getParam(params.data_fim),
  }
  const logs = logsBase.filter((log: any) => matchesLog(log, filters))
  const hasFilters = Object.values(filters).some(Boolean)
  const eventos = uniqueValues(logsBase, 'evento')
  const statusAnteriores = uniqueValues(logsBase, 'status_anterior')
  const statusNovos = uniqueValues(logsBase, 'status_novo')
  const totalFalhas = logs.filter((log: any) => String(log.evento ?? '').includes('erro') || String(log.status_novo ?? '') === 'falha').length
  const totalEnvios = logs.filter((log: any) => String(log.evento ?? '').includes('enviado') || String(log.evento ?? '').includes('envio')).length
  const totalAprovacoes = logs.filter((log: any) => String(log.evento ?? '').includes('aprovado') || String(log.status_novo ?? '') === 'aprovada').length
  const totalRetornos = logs.filter((log: any) => String(log.evento ?? '').includes('retorno')).length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mensageria"
        title="Log operacional"
        description="Auditoria dos eventos de criação, aprovação, cancelamento, envio e reprocessamento de mensagens."
        actions={
          <Link
            href="/app/mensageria"
            className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Voltar
          </Link>
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Eventos</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{logs.length}</p>
          <p className="mt-1 text-sm text-slate-500">no recorte atual</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Envios</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-700">{totalEnvios}</p>
          <p className="mt-1 text-sm text-slate-500">e-mail ou WhatsApp</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Aprovações</p>
          <p className="mt-2 text-2xl font-semibold text-sky-700">{totalAprovacoes}</p>
          <p className="mt-1 text-sm text-slate-500">mensagens, itens e lotes</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Falhas</p>
          <p className="mt-2 text-2xl font-semibold text-rose-700">{totalFalhas}</p>
          <p className="mt-1 text-sm text-slate-500">{totalRetornos} retorno(s) manual(is)</p>
        </Card>
      </div>

      <Card className="p-5">
        <ListTitleBar>
          <ListTitle title="Filtros" description="Pesquise eventos por texto, tipo de evento, período e transição de status." />
          <ClearFiltersLink href="/app/mensageria/log" show={hasFilters} />
        </ListTitleBar>
        <ListFiltersForm className="xl:grid-cols-[minmax(260px,1.2fr)_220px_160px_160px_150px_150px_auto]">
          <ListSearchField defaultValue={filters.q} placeholder="Evento, descrição, lote ou mensagem" />
          <ListFilterField label="Evento">
            <Select name="evento" defaultValue={filters.evento}>
              <option value="">Todos</option>
              {eventos.map((evento) => <option key={evento} value={evento}>{eventLabel(evento)}</option>)}
            </Select>
          </ListFilterField>
          <ListFilterField label="De">
            <Select name="status_anterior" defaultValue={filters.status_anterior}>
              <option value="">Todos</option>
              {statusAnteriores.map((status) => <option key={status} value={status}>{status}</option>)}
            </Select>
          </ListFilterField>
          <ListFilterField label="Para">
            <Select name="status_novo" defaultValue={filters.status_novo}>
              <option value="">Todos</option>
              {statusNovos.map((status) => <option key={status} value={status}>{status}</option>)}
            </Select>
          </ListFilterField>
          <ListFilterField label="Início">
            <input
              type="date"
              name="data_inicio"
              defaultValue={filters.data_inicio}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[var(--gkli-primary)] focus:ring-4 focus:ring-[var(--gkli-primary)]/10"
            />
          </ListFilterField>
          <ListFilterField label="Fim">
            <input
              type="date"
              name="data_fim"
              defaultValue={filters.data_fim}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[var(--gkli-primary)] focus:ring-4 focus:ring-[var(--gkli-primary)]/10"
            />
          </ListFilterField>
          <Button type="submit">Filtrar</Button>
        </ListFiltersForm>
      </Card>

      {logs.length === 0 ? (
        <EmptyState title="Nenhum log registrado" description="Os próximos lotes de mensageria criarão eventos de auditoria aqui." />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y divide-slate-100">
            {logs.map((log: any) => (
              <div key={log.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_190px_170px] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${eventTone(log.evento)}`}>
                      {eventLabel(log.evento)}
                    </span>
                    <span className="text-xs text-slate-400">{log.evento}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{log.descricao || 'Evento operacional de mensageria'}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    {log.lote_id ? (
                      <Link href={`/app/lotes/${log.lote_id}`} className="font-semibold text-[var(--gkli-primary)] hover:underline">
                        Lote {String(log.lote_id).slice(0, 8)}
                      </Link>
                    ) : null}
                    {log.lote_item_id ? <span>Item {String(log.lote_item_id).slice(0, 8)}</span> : null}
                    {log.mensagem_id ? <span>Mensagem {String(log.mensagem_id).slice(0, 8)}</span> : null}
                  </div>
                </div>
                <div className="text-sm text-slate-500">
                  <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Status</span>
                  {log.status_anterior || '-'} -&gt; {log.status_novo || '-'}
                </div>
                <div className="text-sm text-slate-500 lg:text-right">
                  <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Registro</span>
                  {formatDateTimeBR(log.created_at)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
