import { Card } from '@/components/ui/card'
import { formatDateBR } from '@/utils/formatters/date'

export function CobrancaTimeline({ eventos, interacoes }: { eventos: any[]; interacoes: any[] }) {
  const items = [
    ...eventos.map((evento) => ({ ...evento, kind: 'evento', date: evento.criado_em })),
    ...interacoes.map((interacao) => ({ ...interacao, kind: 'interacao', date: interacao.created_at })),
  ].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-950">Linha do tempo</h2>
        <p className="mt-1 text-sm text-slate-500">Eventos, auditoria e interações em ordem cronológica.</p>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">Nenhum evento ou interação registrado.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <div key={`${item.kind}-${item.id}`} className="px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-slate-950">
                  {item.kind === 'interacao' ? `Interação · ${item.tipo}` : item.titulo}
                </p>
                <p className="text-xs text-slate-500">{formatDateBR(item.date)}</p>
              </div>
              {item.estado_anterior || item.estado_novo ? (
                <p className="mt-1 text-xs text-slate-500">{item.estado_anterior ?? '-'} → {item.estado_novo ?? '-'}</p>
              ) : null}
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.kind === 'interacao' ? item.conteudo : item.descricao ?? item.tipo}</p>
              {item.kind === 'interacao' ? (
                <p className="mt-2 text-xs text-slate-400">Por {item.profiles?.nome ?? item.profiles?.email ?? 'usuário não identificado'}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
