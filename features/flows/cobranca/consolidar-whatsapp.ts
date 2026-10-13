import { createAdminClient } from '@/utils/supabase/admin'
import { agruparWhatsAppUnidade } from './agrupar-whatsapp'

export async function consolidarWhatsAppLote(loteId: string, db = createAdminClient()) {
  const rows: any[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from('mensagens')
      .select('*,cobranca:cobrancas(unidade_id,valor_atualizado,valor_original,competencia),envios:whatsapp_web_envios(token)')
      .eq('lote_id', loteId).eq('canal', 'whatsapp')
      .in('status', ['pendente_aprovacao', 'aprovada', 'agendada']).order('id').range(offset, offset + 499)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 500) break
  }
  let removidas = 0
  for (const grupo of agruparWhatsAppUnidade(rows)) {
    const { error } = await db.rpc('whatsapp_consolidar_unidade', { p_lote: loteId, p_principal: grupo.principal,
      p_ids: grupo.ids, p_conteudo: grupo.conteudo, p_payload: grupo.payload })
    if (error) throw new Error(`Erro ao consolidar WhatsApp da unidade: ${error.message}`)
    removidas += grupo.ids.length - 1
  }
  return { removidas }
}
