import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { requireRole } from '@/utils/auth/require-role'
import { createAdminClient } from '@/utils/supabase/admin'
import { carregarCaso } from '@/features/keila/casos-service'
import { baixarAnexosKeila } from '@/features/keila/anexos'

export async function GET(_request: Request, context: { params: Promise<{ id: string; indice: string }> }) {
  await requireRole(['admin', 'gestor', 'operador'])
  const scope = await getPermittedCarteiras()
  const { id, indice } = await context.params
  if (!/^[0-3]$/.test(indice)) return new Response('Anexo inválido.', { status: 400 })
  const db = createAdminClient()
  try {
    const caso = await carregarCaso(db, id, scope.carteiraIds)
    const refs = caso.payload.resposta_aprovada?.anexos ?? caso.payload.resposta_anexos ?? []
    const ref = refs[Number(indice)]
    if (!ref) return new Response('Anexo não encontrado.', { status: 404 })
    const [pdf] = await baixarAnexosKeila(db, id, [ref])
    return new Response(new Uint8Array(pdf.content), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(pdf.filename)}`, 'Cache-Control': 'private, no-store' } })
  } catch { return new Response('Anexo indisponível neste atendimento.', { status: 404 }) }
}
