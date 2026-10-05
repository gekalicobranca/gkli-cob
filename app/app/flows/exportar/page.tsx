import { requireUser } from '@/utils/auth/require-user'
import { FlowConfigExport } from '@/components/flows/config-export'

export default async function ExportarFlowPage() {
  const user = await requireUser()
  if (user.perfil !== 'admin') return <p>Exportação completa restrita a administradores.</p>
  return <FlowConfigExport />
}
