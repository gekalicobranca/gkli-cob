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
import { formatDateBR } from '@/utils/formatters/date'

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

function matchesLog(log: any, filters: Record<string, string>) {
  const q = normalizeText(filters.q)
  const haystack = normalizeText([log.evento, log.descricao, log.lote_id, log.mensagem_id].filter(Boolean).join(' '))

  if (q && !haystack.includes(q)) return false
  if (filters.evento && log.evento !== filters.evento) return false
  if (filters.status_anterior && log.status_anterior !== filters.status_anterior) return false
  if (filters.status_novo && log.status_novo !== filters.status_novo) return false
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
  }
  const logs = logsBase.filter((log: any) => matchesLog(log, filters))
  const hasFilters = Object.values(filters).some(Boolean)
  const eventos = uniqueValues(logsBase, 'evento')
  const statusAnteriores = uniqueValues(logsBase, 'status_anterior')
  const statusNovos = uniqueValues(logsBase, 'status_novo')

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

      <Card className="p-5">
        <ListTitleBar>
          <ListTitle title="Filtros" description="Pesquise eventos por texto, tipo de evento e transição de status." />
          <ClearFiltersLink href="/app/mensageria/log" show={hasFilters} />
        </ListTitleBar>
        <ListFiltersForm className="xl:grid-cols-[minmax(260px,1.2fr)_220px_180px_180px_auto]">
          <ListSearchField defaultValue={filters.q} placeholder="Evento, descrição, lote ou mensagem" />
          <ListFilterField label="Evento">
            <Select name="evento" defaultValue={filters.evento}>
              <option value="">Todos</option>
              {eventos.map((evento) => <option key={evento} value={evento}>{evento}</option>)}
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
          <Button type="submit">Filtrar</Button>
        </ListFiltersForm>
      </Card>

      {logs.length === 0 ? (
        <EmptyState title="Nenhum log registrado" description="Os próximos lotes de mensageria criarão eventos de auditoria aqui." />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y divide-slate-100">
            {logs.map((log: any) => (
              <div key={log.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_180px_160px] lg:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{log.evento}</p>
                  <p className="mt-1 text-xs text-slate-500">{log.descricao || 'Evento operacional de mensageria'}</p>
                  {log.lote_id ? (
                    <Link href={`/app/lotes/${log.lote_id}`} className="mt-1 inline-flex text-xs text-[var(--gkli-primary)] hover:underline">
                      Abrir lote {String(log.lote_id).slice(0, 8)}
                    </Link>
                  ) : null}
                </div>
                <div className="text-sm text-slate-500">{log.status_anterior || '-'} → {log.status_novo || '-'}</div>
                <div className="text-sm text-slate-500 lg:text-right">{formatDateBR(log.created_at)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
