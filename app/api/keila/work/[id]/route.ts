import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuthenticatedApiUser } from '@/app/api/_lib/auth'
import { anexarRelatorioWork, carregarEntregaWork, LIMITE_RELATORIO_WORK } from '@/features/keila/work-entrega'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireAuthenticatedApiUser()
  if (response) return response
  const scope = await getPermittedCarteiras()
  if (!['admin', 'gestor', 'operador'].includes(scope.perfil) || request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Envio não autorizado.' }, { status: 403 })
  }
  const { id } = await context.params
  const db = createAdminClient()
  const entrega = await carregarEntregaWork(db, id, scope.carteiraIds)
  if (!entrega) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  if (Number(request.headers.get('content-length')) > LIMITE_RELATORIO_WORK + 8192) {
    return NextResponse.json({ error: 'O XLSX ultrapassa 4 MB.' }, { status: 413 })
  }
  try {
    const data = await request.formData()
    const arquivo = data.get('arquivo')
    if (!(arquivo instanceof File)) throw new Error('Selecione o relatório XLSX.')
    await anexarRelatorioWork(db, entrega, arquivo)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha no envio do XLSX.' }, { status: 422 })
  }
  revalidatePath('/app/gestao/keila')
  return NextResponse.redirect(new URL(`/app/gestao/keila/work/${id}`, request.url), 303)
}
