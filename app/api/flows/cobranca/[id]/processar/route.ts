import { NextRequest, NextResponse } from 'next/server'
import { executarDisparosWhatsapp } from '@/features/mensageria/whatsapp-cloud/dispatcher'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { requireRole } from '@/utils/auth/require-role'
import { createAdminClient } from '@/utils/supabase/admin'

export const maxDuration = 60

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    await requireRole(['admin', 'gestor', 'operador'])
    const { id } = await context.params
    const scope = await getPermittedCarteiras()
    const supabase = createAdminClient()

    let query = supabase
      .from('cobranca_flows')
      .select('id,status,carteira_id')
      .eq('id', id)
      .maybeSingle()
    query = applyCarteiraScope(query, scope.carteiraIds)
    const { data: flow, error } = await query
    if (error) throw new Error(`Erro ao carregar Flow cobrança: ${error.message}`)
    if (!flow) return NextResponse.json({ error: 'Flow cobrança não encontrado.' }, { status: 404 })
    if (flow.status !== 'em_execucao') {
      return NextResponse.json({ error: 'Somente Flows em execução podem ser processados agora.' }, { status: 409 })
    }

    const resultado = await executarDisparosWhatsapp(100, { cobrancaFlowId: id })
    return NextResponse.json({ ok: true, ...resultado }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao processar o Flow de cobrança.'
    const status = /não autenticado/i.test(message) ? 401 : /permissão|acesso/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
