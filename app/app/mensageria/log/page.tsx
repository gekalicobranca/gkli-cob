import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/data/empty-state'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listMensageriaLogs } from '@/features/mensageria/queries'
import { formatDateBR } from '@/utils/formatters/date'

export default async function MensageriaLogPage() {
  const scope = await getPermittedCarteiras()
  const logs = await listMensageriaLogs(scope)

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
