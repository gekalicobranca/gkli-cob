import { createHash } from 'node:crypto'
import { normalizePhone } from './delivery.mjs'

export function contactIssue(message, charge, outcome) {
  // Uma falha de conexão ou envio incerto não diz nada sobre o telefone.
  if (outcome.state !== 'falha' || outcome.error !== 'Número não encontrado no WhatsApp.') return null
  const phone = normalizePhone(message.destinatario)
  if (!phone || !message.carteira_id) return null
  const hex = createHash('sha256').update(`whatsapp-inexistente:${message.carteira_id}:${charge?.unidade_id || ''}:${phone}`).digest('hex')
  const id = `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`
  return {
    id, carteira_id: message.carteira_id, origem: 'mensageria', tipo: 'telefone_sem_whatsapp',
    status: 'aberta', prioridade: 'normal', titulo: 'Telefone não encontrado no WhatsApp',
    descricao: `O número ${phone} não foi encontrado no WhatsApp. Conferir e corrigir o contato vinculado à unidade. O telefone foi preservado, pois pode continuar válido para ligações.`,
    entidade_tipo: charge?.unidade_id ? 'unidade' : 'mensagem', entidade_id: charge?.unidade_id || message.id,
    condominio_id: charge?.condominio_id || null, unidade_id: charge?.unidade_id || null,
    cobranca_id: message.cobranca_id || null, acordo_id: message.acordo_id || null,
    payload: { telefone: phone, canal: 'whatsapp', mensagem_id: message.id, origem: 'whatsapp_web', motivo: outcome.error, verificado_em: new Date().toISOString() },
  }
}

export async function recordContactIssue(db, message, outcome) {
  if (outcome.state !== 'falha' || outcome.error !== 'Número não encontrado no WhatsApp.') return false
  let charge = null
  if (message.cobranca_id) {
    const { data, error } = await db.from('cobrancas').select('unidade_id,condominio_id').eq('id', message.cobranca_id).single()
    if (error) throw new Error(error.message)
    charge = data
  } else if (message.acordo_id) {
    const { data, error } = await db.from('acordos').select('unidade_id,condominio_id').eq('id', message.acordo_id).single()
    if (error) throw new Error(error.message)
    charge = data
  }
  const issue = contactIssue(message, charge, outcome)
  if (!issue) return false
  // Um registro por carteira/unidade/número; reexecuções não duplicam a pendência
  // nem reabrem uma correção já resolvida pelo operador.
  const { error } = await db.from('central_pendencias').upsert(issue, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  return true
}
