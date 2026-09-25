'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/utils/auth/require-admin'
import { createAdminClient } from '@/utils/supabase/admin'

export async function controlarWhatsappWorker(form: FormData) {
  const user = await requireAdmin()
  const sessao = String(form.get('sessao') ?? '')
  const acao = String(form.get('acao') ?? '')
  if (!/^[a-zA-Z0-9_-]{1,60}$/.test(sessao) || !['iniciar', 'pausar', 'reiniciar'].includes(acao)) throw new Error('Comando inválido.')
  const db = createAdminClient()
  const { data, error: lookupError } = await db.from('carteiras').select('id').eq('whatsapp_web_sessao', sessao).limit(1)
  if (lookupError || !data?.length) throw new Error('Sessão não configurada.')
  const { error } = await db.from('whatsapp_worker_controles').upsert({
    sessao, habilitado: acao !== 'pausar', reiniciar_id: crypto.randomUUID(),
    solicitado_por: user.id, atualizado_em: new Date().toISOString(),
  })
  if (error) throw new Error('Não foi possível solicitar o comando ao supervisor.')
  revalidatePath('/app/configuracoes/whatsapp-web')
}

export async function reenviarWhatsappIncerto(form: FormData) {
  const user = await requireAdmin()
  if (form.get('aceitar_duplicidade') !== 'on') throw new Error('Confirme o risco de duplicidade.')
  const { error } = await createAdminClient().rpc('whatsapp_web_reenviar_incerto', {
    p_token: String(form.get('token') ?? ''), p_usuario: user.id,
    p_observacao: String(form.get('observacao') ?? '').trim(),
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/configuracoes/whatsapp-web')
  revalidatePath('/app/flows/cobranca/whatsapp')
}

export async function configurarWhatsappWeb(form: FormData) {
  await requireAdmin()
  const id = String(form.get('carteira_id') ?? '')
  const transporte = String(form.get('transporte') ?? '')
  const sessao = String(form.get('sessao') ?? '').trim()
  const digits = String(form.get('numero') ?? '').replace(/\D/g, '')
  const numero = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits
  if (!['cloud','web'].includes(transporte)) throw new Error('Transporte inválido.')
  if (transporte === 'web' && (!/^[a-zA-Z0-9_-]{1,60}$/.test(sessao) || !/^55[1-9]\d{9,10}$/.test(numero))) {
    throw new Error('Informe a sessão e um número brasileiro válido com DDD.')
  }
  const { error } = await createAdminClient().from('carteiras').update({
    whatsapp_transporte: transporte,
    whatsapp_web_sessao: sessao || null,
    whatsapp_web_numero: numero || null,
  }).eq('id',id)
  if (error) throw new Error(`Erro ao configurar WhatsApp: ${error.message}`)
  revalidatePath('/app/configuracoes/whatsapp-web')
}

export async function conferirWhatsappWeb(form: FormData) {
  const user = await requireAdmin()
  const resultado = String(form.get('resultado') ?? '')
  if (!['enviado','nao_enviado'].includes(resultado)) throw new Error('Informe o resultado da conferência.')
  if (form.get('worker_parado') !== 'on') throw new Error('Pare o worker antes de conferir a reserva.')
  const { error } = await createAdminClient().rpc('whatsapp_web_conferir', {
    p_token: String(form.get('token') ?? ''),
    p_enviado: resultado === 'enviado',
    p_usuario: user.id,
    p_observacao: String(form.get('observacao') ?? '').trim(),
  })
  if (error) throw new Error(error.message)
  for (const path of ['/app/configuracoes/whatsapp-web','/app/flows/cobranca/email','/app/flows/cobranca/whatsapp','/app/flows/acordos','/app/pre-juridico/flow','/app/lotes']) revalidatePath(path)
}
