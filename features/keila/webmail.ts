import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderTemplate } from '../mensageria/render-template'

export const SAFIRA_PILOTO_ID = '2b1aa7ca-91d6-44fc-b667-8fb9bfeffb53'
export const KEILA_WEBMAIL_URL = 'https://outlook.office.com/mail/?login_hint=keila%40gekali.com.br'

export function validarLinkWebmail(value: string) {
  if (!value.trim()) return undefined
  const url = new URL(value.trim())
  if (url.protocol !== 'https:' || !['outlook.office.com', 'outlook.office365.com', 'outlook.live.com'].includes(url.hostname) || url.username || url.password || url.port) {
    throw new Error('Use o endereço HTTPS da mensagem no Outlook.')
  }
  return url.href
}

export async function carregarFlowsWebmail(db: SupabaseClient, carteiraIds: string[] | null) {
  let query = db.from('condominios').select('id,carteira_id,keila_retornos_desde,operacao_virtual_habilitada').eq('id', SAFIRA_PILOTO_ID)
  if (carteiraIds !== null) query = query.in('carteira_id', carteiraIds)
  const { data: condo, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  if (!condo) return { condominio: null, mensagens: [] }
  const permitidos = new Set<string>()
  for (let offset = 0; ; offset += 500) {
    const { data: itens, error: itemError } = await db.from('lote_itens').select('id').eq('condominio_id', condo.id).order('id').range(offset, offset + 499)
    if (itemError) throw new Error(itemError.message)
    for (const item of itens ?? []) permitidos.add(item.id)
    if ((itens?.length ?? 0) < 500) break
  }
  if (!permitidos.size) return { condominio: condo, mensagens: [] }
  // Paginate rather than dropping recipients past the Data API row limit.
  const mensagens: { id: string; destinatario: string; email_assunto: string | null; flow_nome: string }[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error: messageError } = await db.from('mensagens')
      .select('id,lote_item_id,destinatario,email_assunto,payload,template:mensagens_templates(assunto),flow:cobranca_flows!inner(nome,status,iniciado_em)')
      .eq('carteira_id', condo.carteira_id).eq('canal', 'email').eq('status', 'enviada')
      .neq('flow.status', 'cancelado').not('flow.iniciado_em', 'is', null)
      .order('created_at', { ascending: false }).order('id').range(offset, offset + 499)
    if (messageError) throw new Error(messageError.message)
    for (const m of data ?? []) {
      if (!permitidos.has(m.lote_item_id)) continue
      const flow = Array.isArray(m.flow) ? m.flow[0] : m.flow
      const template = Array.isArray(m.template) ? m.template[0] : m.template
      const assunto = renderTemplate(m.email_assunto || template?.assunto || 'Mensagem GKLI Cobrança', m.payload?.contexto ?? {})
      mensagens.push({ id: m.id, destinatario: m.destinatario, email_assunto: assunto, flow_nome: flow.nome })
    }
    if ((data?.length ?? 0) < 500) break
  }
  return { condominio: condo, mensagens }
}

export async function registrarRetornoWebmail(db: SupabaseClient, carteiraIds: string[] | null, input: {
  mensagemId: string; recebidoEm: string; conteudo: string; link: string
}) {
  const link = validarLinkWebmail(input.link)
  const data = new Date(input.recebidoEm)
  if (!Number.isFinite(data.getTime()) || data.getTime() > Date.now() + 60_000) throw new Error('Data de recebimento inválida.')
  const conteudo = input.conteudo.trim()
  if (!conteudo || conteudo.length > 10000) throw new Error('Informe o retorno em até 10.000 caracteres.')
  const { condominio, mensagens } = await carregarFlowsWebmail(db, carteiraIds)
  if (!condominio?.operacao_virtual_habilitada || !condominio.keila_retornos_desde) throw new Error('Piloto da Keila não está habilitado no Safira.')
  if (data < new Date(condominio.keila_retornos_desde)) throw new Error('Este retorno é anterior à habilitação da Keila. Registre-o pelo atendimento manual.')
  if (!mensagens.some(m => m.id === input.mensagemId)) throw new Error('Selecione um e-mail enviado por um flow do Safira nas carteiras permitidas.')
  const { data: updated, error } = await db.from('mensagens').update({ retorno_tipo: 'resposta_email', retorno_origem: 'webmail_supervisionado',
    retorno_observacao: conteudo, retorno_registrado_em: data.toISOString() }).eq('id', input.mensagemId).eq('carteira_id', condominio.carteira_id).eq('status', 'enviada').select('id').maybeSingle()
  if (error || !updated) throw new Error(error?.message ?? 'O e-mail foi alterado. Recarregue a tela.')
  const hash = createHash('md5').update(`keila:flow-retorno:${input.mensagemId}`).digest('hex')
  const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20)}`
  // Preserve the original Outlook URL alongside the recorded message.
  const { data: caso, error: caseError } = await db.from('central_pendencias').select('payload,updated_at').eq('id', id).eq('tipo', 'keila_atendimento').eq('carteira_id', condominio.carteira_id).single()
  if (caseError || !caso) throw new Error('Retorno registrado, mas o atendimento não foi localizado. Confira se o flow continua habilitado.')
  if (link) {
    const emails = caso.payload.emails.map((email: { recebido_em: string }) => new Date(email.recebido_em).getTime() === data.getTime() ? { ...email, webmail_url: link } : email)
    const { data: saved, error: saveError } = await db.from('central_pendencias').update({ payload: { ...caso.payload, emails }, updated_at: new Date().toISOString() }).eq('id',id).eq('updated_at',caso.updated_at).select('id').maybeSingle()
    if (saveError || !saved) throw new Error('Retorno registrado. Recarregue o caso para conferir o vínculo do webmail.')
  }
  return id
}
