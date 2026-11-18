import { Card } from '@/components/ui/card'
import { formatDateBR } from '@/utils/formatters/date'

export function CobrancaTimeline({ eventos }: { eventos: any[] }) {
  const items = eventos
    .map((evento) => ({ ...evento, date: evento.criado_em }))
    .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-950">Linha do tempo</h2>
        <p className="mt-1 text-sm text-slate-500">Eventos e auditoria em ordem cronológica.</p>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">Nenhum evento registrado.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <div key={`evento-${item.id}`} className="px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-slate-950">
                  {item.titulo}
                </p>
                <p className="text-xs text-slate-500">{formatDateBR(item.date)}</p>
              </div>
              {item.estado_anterior || item.estado_novo ? (
                <p className="mt-1 text-xs text-slate-500">{item.estado_anterior ?? '-'} → {item.estado_novo ?? '-'}</p>
              ) : null}
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.descricao ?? item.tipo}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
