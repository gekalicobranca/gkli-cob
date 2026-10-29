import { ButtonLink } from '@/components/ui/button'
import { StatusBadge } from '@/components/data/status-badge'
import { formatDateBR } from '@/utils/formatters/date'

export function CobrancaMensageriaCard({ mensagens }: { mensagens: any[]; telefone?: string | null; responsavel?: string | null }) {
  const last = mensagens[0]

  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold">Mensagens ({mensagens.length})</summary>

      <div className="mt-4 space-y-3">
        {last ? (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <StatusBadge status={last.status_operacional ?? last.status} />
              <span className="text-xs text-slate-500">{formatDateBR(last.created_at ?? last.criado_em)}</span>
            </div>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{last.conteudo_renderizado ?? last.conteudo ?? last.email_assunto ?? 'Mensagem sem conteúdo renderizado.'}</p>
          </div>
        ) : (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Nenhuma mensagem vinculada a esta cobrança.</p>
        )}
        <ButtonLink href="/app/mensageria" variant="secondary" size="sm">Abrir mensageria</ButtonLink>
      </div>
    </details>
  )
}
