import { createAdminClient } from '../utils/supabase/admin'
import { agruparWhatsAppUnidade } from '../features/flows/cobranca/agrupar-whatsapp'
import { consolidarWhatsAppLote } from '../features/flows/cobranca/consolidar-whatsapp'

const db = createAdminClient()
const apply = process.argv.includes('--apply')
async function pending() {
  const rows: any[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from('mensagens')
      .select('*,cobranca:cobrancas(unidade_id,valor_atualizado,valor_original,competencia),envios:whatsapp_web_envios(token)')
      .eq('canal', 'whatsapp').not('cobranca_flow_id', 'is', null)
      .in('status', ['pendente_aprovacao', 'aprovada', 'agendada']).order('id').range(offset, offset + 499)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data ?? []).length < 500) return rows
  }
}
async function main() {
  const before = await pending()
  const groups = agruparWhatsAppUnidade(before)
  console.log(JSON.stringify({ modo: apply ? 'aplicar' : 'previa', pendentes: before.length,
    grupos: groups.length, mensagensReunidas: groups.reduce((sum, g) => sum + g.ids.length, 0),
    reducao: groups.reduce((sum, g) => sum + g.ids.length - 1, 0) }))
  if (!apply || !groups.length) return
  // Temporarily stop only workers serving affected wallets, restoring their
  // original enabled state even when consolidation fails.
  const walletIds = [...new Set(before.map(m => m.carteira_id))]
  const { data: wallets, error: we } = await db.from('carteiras').select('whatsapp_web_sessao').in('id', walletIds).eq('whatsapp_transporte', 'web')
  if (we) throw we
  const sessions = [...new Set((wallets ?? []).map(w => w.whatsapp_web_sessao).filter(Boolean))]
  const { data: controls, error: ce } = await db.from('whatsapp_worker_controles').select('sessao,habilitado').in('sessao', sessions)
  if (ce) throw ce
  const enabled = (controls ?? []).filter(c => c.habilitado).map(c => c.sessao)
  try {
    if (enabled.length) {
      const { error } = await db.from('whatsapp_worker_controles').update({ habilitado: false }).in('sessao', enabled)
      if (error) throw error
      const deadline = Date.now() + 120000
      for (;;) {
        const { data, error } = await db.from('whatsapp_worker_controles').select('supervisor_status').in('sessao', enabled)
        if (error) throw error
        if (data?.length === enabled.length && data.every(c => c.supervisor_status === 'pausado')) break
        if (Date.now() > deadline) throw new Error('Supervisor não confirmou a pausa; nenhuma consolidação iniciada.')
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    }
    let removed = 0
    for (const lote of new Set(groups.map(g => g.lote))) removed += (await consolidarWhatsAppLote(lote, db)).removidas
    const after = await pending()
    console.log(JSON.stringify({ consolidadas: removed, pendentesDepois: after.length, gruposRestantes: agruparWhatsAppUnidade(after).length }))
  } finally {
    if (enabled.length) {
      const { error } = await db.from('whatsapp_worker_controles').update({ habilitado: true }).in('sessao', enabled)
      if (error) throw new Error(`Falha ao restaurar workers: ${error.message}`)
      console.log('Workers restaurados.')
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
