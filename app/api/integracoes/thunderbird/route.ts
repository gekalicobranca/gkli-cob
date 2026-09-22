import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { recalcularReferenciasMensagem } from '@/features/mensageria/whatsapp-cloud/flows'
export const maxDuration = 60
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status') }),
  z.object({ action: z.literal('claim'), testOnly: z.boolean().default(false) }),
  z.object({ action: z.literal('start'), jobId: z.uuid() }),
  z.object({ action: z.literal('complete'), jobId: z.uuid(), state: z.enum(['enviado','falha','incerto']), receipt: z.string().max(500).optional(), error: z.string().max(500).optional() }),
  z.object({ action: z.literal('mode'), enabled: z.boolean() }),
])
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } }) }
export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([a-zA-Z0-9_-]{43})$/)?.[1]
  if (!token) return json({ error: 'Dispositivo não autorizado.' }, 401)
  const db = createAdminClient()
  const { data: d, error: authError } = await db.from('thunderbird_dispositivos').select('id,carteira_id,email,automatico,testado_em')
    .eq('token_hash', createHash('sha256').update(token).digest('hex')).eq('ativo', true).maybeSingle()
  if (authError || !d) return json({ error: 'Dispositivo não autorizado.' }, 401)
  const parsed = input.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ error: 'Solicitação inválida.' }, 400)
  const body = parsed.data
  try {
    if (body.action === 'status') {
      const { data: jobs } = await db.from('thunderbird_envios').select('id,tipo,estado,erro,atualizado_em').eq('dispositivo_id', d.id).order('criado_em', { ascending: false }).limit(5)
      return json({ email: d.email, automatic: d.automatico, tested: Boolean(d.testado_em), jobs })
    }
    if (body.action === 'mode') {
      const { error } = await db.rpc('thunderbird_modo', { p_dispositivo: d.id, p_automatico: body.enabled })
      if (error) throw new Error('Conclua o teste antes de ativar a fila.')
      return json({ ok: true })
    }
    if (body.action === 'start') {
      const { data, error } = await db.rpc('thunderbird_iniciar', { p_dispositivo: d.id, p_envio: body.jobId })
      if (error) throw new Error('Falha ao autorizar envio.')
      return json({ ok: data === true })
    }
    if (body.action === 'complete') {
      const { error } = await db.rpc('thunderbird_concluir', { p_dispositivo: d.id, p_envio: body.jobId, p_estado: body.state, p_recibo: body.receipt || null, p_erro: body.error || null })
      if (error) throw new Error('Falha ao registrar resultado. Não reenvie a mensagem.')
      const { data: job } = await db.from('thunderbird_envios').select('mensagem_id').eq('id', body.jobId).eq('dispositivo_id', d.id).single()
      if (job?.mensagem_id) {
        const { data: m } = await db.from('mensagens').select('*').eq('id', job.mensagem_id).single()
        if (m) await recalcularReferenciasMensagem(db, m)
      }
      return json({ ok: true })
    }
    const { data: e, error } = await db.rpc('thunderbird_reservar', { p_dispositivo: d.id, p_somente_teste: body.testOnly })
    if (error) throw new Error('Falha ao reservar mensagem.')
    if (!e) return json({ job: null })
    try {
      let to = e.destinatario, subject = e.assunto, text = e.corpo, bcc = null
      const attachments = []
      if (e.mensagem_id) {
        const { data: m, error } = await db.from('mensagens').select('*').eq('id', e.mensagem_id).eq('carteira_id', d.carteira_id).single()
        if (error || !m) throw new Error('Mensagem indisponível.')
        to = m.destinatario; text = m.conteudo_renderizado || m.conteudo
        subject = m.email_assunto
        if (!subject && m.template_id) {
          const { data: template } = await db.from('mensagens_templates').select('assunto').eq('id', m.template_id).maybeSingle()
          subject = template?.assunto
        }
        subject = String(subject || 'Mensagem GKLI Cobrança').replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => String(m.payload?.contexto?.[key] ?? ''))
        if (m.cobranca_flow_id || m.acordo_flow_id) {
          const { data: carteira, error } = await db.from('carteiras').select('email_controle').eq('id', d.carteira_id).single()
          if (error) throw new Error('Não foi possível consultar o e-mail de controle.')
          bcc = carteira.email_controle || null
        }
        const { data: rows, error: attachmentError } = await db.from('mensagem_anexos').select('ordem,documento:documentos_gerados(nome_arquivo,content_type,storage_bucket,storage_path)').eq('mensagem_id', m.id).order('ordem')
        if (attachmentError) throw new Error('Anexos indisponíveis.')
        for (const row of rows || []) {
          const doc: any = Array.isArray(row.documento) ? row.documento[0] : row.documento
          if (!doc?.storage_bucket || !doc.storage_path) throw new Error('Anexo inválido.')
          const { data: signed, error } = await db.storage.from(doc.storage_bucket).createSignedUrl(doc.storage_path, 600)
          if (error || !signed?.signedUrl) throw new Error('Anexo indisponível.')
          attachments.push({ name: doc.nome_arquivo, type: doc.content_type, url: signed.signedUrl })
        }
      }
      if (!z.email().safeParse(to).success || (bcc && !z.email().safeParse(bcc).success) || !text || !subject || /[\r\n]/.test(subject)) throw new Error('Mensagem com endereço ou conteúdo inválido.')
      return json({ job: { id: e.id, kind: e.tipo, from: d.email, to, bcc: bcc === to ? null : bcc, subject, text, attachments } })
    } catch (error) {
      await db.rpc('thunderbird_concluir', { p_dispositivo: d.id, p_envio: e.id, p_estado: 'falha', p_erro: 'Falha ao preparar conteúdo ou anexos.' })
      throw error
    }
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Falha no Thunderbird.' }, 409) }
}
