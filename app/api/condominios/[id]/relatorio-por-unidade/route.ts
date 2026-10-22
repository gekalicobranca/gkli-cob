import { requireAuthenticatedApiUser } from '@/app/api/_lib/auth'
import { getCondominioIntegral } from '@/features/condominios/queries'
import { RELATORIOS_EXECUTIVOS_PUBLICADOS } from '@/features/condominios/relatorios-publicados'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthenticatedApiUser()
  if (auth.response) return auth.response
  const { id } = await params
  const scope = await getPermittedCarteiras()
  const condominio = await getCondominioIntegral(id, scope)
  const relatorio = RELATORIOS_EXECUTIVOS_PUBLICADOS[id]
  if (!condominio || !relatorio) return Response.json({ error: 'Relatório não encontrado.' }, { status: 404 })

  const { data, error } = await createAdminClient().storage.from('agente-relatorios').download(relatorio.arquivo)
  if (error || !data) return Response.json({ error: 'Relatório indisponível. Tente novamente.' }, { status: 503 })
  return new Response(await data.arrayBuffer(), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${relatorio.arquivo.split('/').pop()}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
