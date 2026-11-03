import { StatusBadge } from '@/components/data/status-badge'
import { formatDateBR } from '@/utils/formatters/date'

export function CobrancaMensageriaCard({ mensagens }: { mensagens: any[]; telefone?: string | null; responsavel?: string | null }) {

  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold">Histórico de mensagens ({mensagens.length})</summary>

      <div className="mt-4 max-h-96 space-y-3 overflow-y-auto">
        {mensagens.length ? mensagens.map(mensagem => (
          <div key={mensagem.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <StatusBadge status={mensagem.status_operacional ?? mensagem.status} />
              <span className="text-xs text-slate-500">{formatDateBR(mensagem.created_at ?? mensagem.criado_em)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{mensagem.conteudo_renderizado ?? mensagem.conteudo ?? mensagem.email_assunto ?? 'Mensagem sem conteúdo renderizado.'}</p>
          </div>
        )) : (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Nenhuma mensagem vinculada a esta cobrança.</p>
        )}
      </div>
    </details>
  )
}
