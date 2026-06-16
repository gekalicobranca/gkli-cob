import { Badge } from '@/components/ui/badge'
import {
  ACORDO_STATUS_LABEL,
  COBRANCA_STATUS_LABEL,
  IMPORTACAO_STATUS_LABEL,
  LOTE_STATUS_LABEL,
  MENSAGEM_STATUS_LABEL,
  normalizeStatus,
} from '@/lib/core/status'

type BadgeTone = React.ComponentProps<typeof Badge>['tone']

type StatusBadgeProps = {
  status?: string | null
  domain?: 'cobranca' | 'acordo' | 'mensagem' | 'lote' | 'importacao' | 'geral'
  label?: string | null
  tone?: BadgeTone | 'green' | 'red' | 'yellow' | 'blue' | 'indigo' | 'slate' | 'primary' | 'amber'
}

function labelFor(status: string) {
  return (
    COBRANCA_STATUS_LABEL[status as keyof typeof COBRANCA_STATUS_LABEL] ||
    ACORDO_STATUS_LABEL[status] ||
    MENSAGEM_STATUS_LABEL[status as keyof typeof MENSAGEM_STATUS_LABEL] ||
    LOTE_STATUS_LABEL[status] ||
    IMPORTACAO_STATUS_LABEL[status] ||
    status.replace(/_/g, ' ').replace(/^\w/, (char) => char.toUpperCase())
  )
}

function normalizeTone(tone?: StatusBadgeProps['tone']): BadgeTone | undefined {
  if (!tone) return undefined
  if (tone === 'amber') return 'yellow'
  return tone as BadgeTone
}

function toneFor(status: string): BadgeTone {
  if (
    [
      'erro',
      'falha',
      'vencido',
      'vencida',
      'em_atraso',
      'judicializado',
      'cancelado',
      'cancelada',
      'rompido',
    ].includes(status)
  ) {
    return 'red'
  }

  if (
    [
      'pendente',
      'pendente_aprovacao',
      'preview',
      'pre_juridico',
      'parcial',
      'processando',
      'agendada',
      'gerado',
      'aguardando_retorno',
    ].includes(status)
  ) {
    return 'yellow'
  }

  if (
    [
      'ativo',
      'em_dia',
      'quitado',
      'paga',
      'enviada',
      'concluido',
      'confirmada',
      'aprovada',
      'aprovado',
      'enviado',
    ].includes(status)
  ) {
    return 'green'
  }

  if (status.includes('acordo') || status.includes('negociacao')) return 'indigo'
  if (status === 'novo') return 'primary'
  if (status.includes('cobranca')) return 'blue'

  return 'slate'
}

export function StatusBadge({ status, label, tone }: StatusBadgeProps) {
  const normalized = normalizeStatus(status || label || 'sem_status')
  const resolvedTone = normalizeTone(tone) ?? toneFor(normalized)
  const resolvedLabel = label ?? labelFor(normalized)

  return <Badge tone={resolvedTone}>{resolvedLabel}</Badge>
}
