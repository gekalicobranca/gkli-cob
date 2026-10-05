import { getCurrentUser } from '@/utils/auth/get-current-user'
import { createAdminClient } from '@/utils/supabase/admin'
import { buildFlowConfigExport } from '@/features/flows/config-export'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  if (user.perfil !== 'admin') return Response.json({ error: 'Exportação completa restrita a administradores.' }, { status: 403 })
  try {
    const result = await buildFlowConfigExport(createAdminClient())
    return Response.json(result, { headers: { 'Cache-Control': 'no-store', 'Content-Disposition':
      `attachment; filename="gkli-flow-config-export-${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())}.json"` } })
  } catch {
    return Response.json({ error: 'Falha ao ler as configurações. Nenhum arquivo parcial foi gerado.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
