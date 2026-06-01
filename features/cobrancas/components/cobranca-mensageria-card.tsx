import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { StatusBadge } from '@/components/data/status-badge'
import { formatDateBR } from '@/utils/formatters/date'

export function CobrancaMensageriaCard({ mensagens, telefone, responsavel }: { mensagens: any[]; telefone?: string | null; responsavel?: string | null }) {
  const last = mensagens[0]
  const whatsappDigits = String(telefone ?? '').replace(/\D/g, '')
  const whatsappHref = whatsappDigits
    ? `https://wa.me/${whatsappDigits.startsWith('55') ? whatsappDigits : `55${whatsappDigits}`}`
    : null

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Mensageria</h2>
          <p className="mt-1 text-sm text-slate-500">Últimos disparos e atalho de contato.</p>
        </div>
        {whatsappHref ? (
          <ButtonLink href={whatsappHref} target="_blank" size="sm">WhatsApp</ButtonLink>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        <p className="text-sm text-slate-600">Contato: {responsavel ?? 'responsável'} · {telefone ?? 'telefone não informado'}</p>
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
    </Card>
  )
}
