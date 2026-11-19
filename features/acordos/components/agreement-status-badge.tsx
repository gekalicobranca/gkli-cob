import { StatusBadge } from '@/components/data/status-badge'

export function AgreementStatusBadge({ status, homologado }: { status?: string | null; homologado?: boolean | null }) {
  if (status === 'ativo' && !homologado) {
    return <StatusBadge status="pendente" label="Pendente de homologação" />
  }

  return <StatusBadge status={status} />
}
