import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { somenteCobrancasCanonicas } from '@/lib/core/cobranca-arquivamento'
import { resumoCobrancasMobile, grupoCobrancaMobile } from './cobrancas-resumo'
import { resumirFlowMobile, type FlowLink } from './flows-resumo'

export async function carregarResumoCobrancasMobile(scope: CarteiraScope, condominioId: string) {
  const db = await createClient()
  const ate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  let query = applyCarteiraScope(somenteCobrancasCanonicas(db.from('cobrancas')
    .select('id,status,status_operacional,status_financeiro,valor_atualizado,valor_original,duplicada_de_id'))
    .lte('vencimento', ate), scope.carteiraIds).order('id')
  if (condominioId) query = query.eq('condominio_id', condominioId)
  const rows: Parameters<typeof resumoCobrancasMobile>[0] = []
  for (let offset = 0; ; offset += 1000) {
    const {data, error} = await query.range(offset, offset + 999)
    if (error) throw new Error(`Não foi possível consultar o resumo de cobranças: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  const eligible = rows.filter(row => grupoCobrancaMobile(row))
  const links: FlowLink[] = []
  const ids = [...new Set(eligible.map(row => row.id))]
  // Flows são restritos ao backend. Consultar somente IDs obtidos pela leitura autenticada e pelo escopo acima.
  const flowDb = ids.length ? createAdminClient() : null
  async function carregarLinks(parte: string[]) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await flowDb!.from('lote_itens')
        .select('id,cobranca_id,created_at,flow:cobranca_flows!lote_itens_cobranca_flow_id_fkey(status,canais:payload->canais,regua:reguas(etapas:regua_etapas(canal,ativo)))')
        .in('cobranca_id', parte).not('cobranca_flow_id', 'is', null).order('id').range(offset, offset + 499)
      if (error) throw new Error('Não foi possível conferir os status dos flows.')
      links.push(...(data ?? []) as unknown as FlowLink[])
      if ((data ?? []).length < 500) break
    }
  }
  for (let i = 0; i < ids.length; i += 800) {
    await Promise.all([0, 200, 400, 600].map(delta => ids.slice(i + delta, i + delta + 200)).filter(parte => parte.length).map(carregarLinks))
  }
  const summary = resumoCobrancasMobile(rows)
  return { ...summary, porStatus: summary.porStatus.map(group => ({ ...group, flows: resumirFlowMobile(eligible.filter(row => grupoCobrancaMobile(row) === group.status), links) })), ate }
}
