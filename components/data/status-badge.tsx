import { Badge } from '@/components/ui/badge'

type StatusBadgeProps = {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = status.toLowerCase()

  if (
    normalized.includes('atraso') ||
    normalized.includes('erro') ||
    normalized.includes('rompido') ||
    normalized.includes('judicializado') ||
    normalized.includes('vencida') ||
    normalized.includes('cancelado')
  ) {
    return <Badge tone="red">{status}</Badge>
  }

  if (
    normalized.includes('negociação') ||
    normalized.includes('preview') ||
    normalized.includes('pendente') ||
    normalized.includes('aberta')
  ) {
    return <Badge tone="yellow">{status}</Badge>
  }

  if (
    normalized.includes('ativo') ||
    normalized.includes('quitado') ||
    normalized.includes('concluida') ||
    normalized.includes('enviada') ||
    normalized.includes('paga') ||
    normalized.includes('válida')
  ) {
    return <Badge tone="green">{status}</Badge>
  }

  if (normalized.includes('acordo')) {
    return <Badge tone="indigo">{status}</Badge>
  }

  if (normalized.includes('novo')) {
    return <Badge tone="primary">{status}</Badge>
  }

  return <Badge>{status}</Badge>
}
