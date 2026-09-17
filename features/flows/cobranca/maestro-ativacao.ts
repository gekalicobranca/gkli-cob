import { createAdminClient } from '@/utils/supabase/admin'
import { getEmailRemetenteKey } from '@/features/mensageria/email-provider'

export async function processarAtivacaoMaestro() {
  const db = createAdminClient()
  const { data: controle, error: ce } = await db.from('automacao_controle').select('ativo').eq('chave', 'captacao_global').maybeSingle()
  if (ce) throw ce
  if (controle?.ativo === false) return { pausada: true }
  const { data: carteiras, error: pe } = await db.from('maestro_flow_controle').select('carteira_id').eq('ativo', true)
  if (pe) throw pe
  if (!carteiras?.length) return { processadas: 0 }
  const { data: fila, error } = await db.from('maestro_flow_ativacoes').select('flow_id,carteira_id')
    .eq('status', 'pendente').in('carteira_id', carteiras.map(c => c.carteira_id)).order('created_at').limit(1)
  if (error) throw error
  const resultados = []
  for (const item of fila ?? []) {
    let remetente: string
    try { remetente = await getEmailRemetenteKey(item.carteira_id) }
    catch (error) {
      const motivo = error instanceof Error ? error.message : 'Configuração de e-mail indisponível.'
      const { error: ue } = await db.from('maestro_flow_ativacoes').update({ status: 'atencao', erro: motivo, updated_at: new Date().toISOString() }).eq('flow_id', item.flow_id).eq('status', 'pendente')
      if (ue) throw ue
      resultados.push({ flowId: item.flow_id, status: 'atencao' })
      continue
    }
    // A reserva da agenda e a conclusão da fila são atômicas no banco.
    // Falha de rede preserva a fila, permitindo repetir sem ativar novamente.
    const { data: status, error: ae } = await db.rpc('maestro_flow_ativar', { p_flow: item.flow_id, p_remetente: remetente })
    if (ae) throw ae
    resultados.push({ flowId: item.flow_id, status })
  }
  return { processadas: resultados.length, resultados }
}
