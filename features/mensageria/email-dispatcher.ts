import { createAdminClient } from '@/utils/supabase/admin'
import { sendSmtpEmail } from './email-provider'
import { EmailAdiadoError } from './email-agenda'
import { listarAnexosMensagem } from '@/features/pre-juridico/documentos'
import { recalcularReferenciasMensagem } from './whatsapp-cloud/flows'

// A autorização final e a reserva de cota são atômicas no provedor/banco.
export async function executarDisparosEmail(limit = 50, cobrancaFlowId?: string) {
  const db = createAdminClient()
  // Somente mensagens que entraram explicitamente na nova agenda podem ser disparadas.
  let query = db.from('mensagens').select('*,reserva:email_agenda!inner(mensagem_id)').eq('canal', 'email').eq('status', 'agendada')
    .is('pre_juridico_flow_id', null).lte('agendada_para', new Date().toISOString())
    .order('agendada_para').limit(Math.max(1, Math.min(limit || 50, 100)))
  if (cobrancaFlowId) query = query.eq('cobranca_flow_id', cobrancaFlowId)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar agenda de e-mail: ${error.message}`)
  const resultado = { avaliadas: data?.length ?? 0, enviadas: 0, adiadas: 0, falhas: 0 }
  for (const m of data ?? []) {
    try {
      let assunto = m.email_assunto
      if (!assunto && m.template_id) {
        const { data: template, error } = await db.from('mensagens_templates').select('assunto').eq('id', m.template_id).maybeSingle()
        if (error) throw error
        assunto = template?.assunto
      }
      const contexto = m.payload?.contexto ?? {}
      assunto = String(assunto || 'Mensagem GKLI Cobrança').replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => String(contexto[key] ?? ''))
      await sendSmtpEmail({ to: m.destinatario || '', subject: assunto,
        text: m.conteudo_renderizado || m.conteudo || '', attachments: await listarAnexosMensagem(db, m.id) },
      { carteiraId: m.carteira_id, mensagemId: m.id, copiarControleFlow: Boolean(m.cobranca_flow_id || m.acordo_flow_id) })
      const now = new Date().toISOString()
      const { error } = await db.from('mensagens').update({ status: 'enviada', status_operacional: 'enviada', enviada_em: now,
        sent_at: now, erro: null, erro_envio: null, proxima_tentativa_em: null, tentativas_envio: (m.tentativas_envio || 0) + 1 }).eq('id', m.id)
      if (error) throw error
      const { error: itemError } = await db.from('lote_itens').update({ status: 'enviado' }).eq('mensagem_id', m.id)
      if (itemError) throw itemError
      resultado.enviadas++
    } catch (error) {
      if (error instanceof EmailAdiadoError) resultado.adiadas++
      else {
        const detalhe = error instanceof Error ? error.message : String(error)
        await db.from('mensagens').update({ status: 'falha', status_operacional: 'falha', erro: detalhe, erro_envio: detalhe }).eq('id', m.id).neq('status', 'enviada')
        await db.from('lote_itens').update({ status: 'erro', erro: detalhe }).eq('mensagem_id', m.id).neq('status', 'enviado')
        resultado.falhas++
      }
    }
    await recalcularReferenciasMensagem(db, m)
  }
  return resultado
}
