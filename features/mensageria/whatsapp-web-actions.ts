'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/utils/auth/require-admin'
import { createAdminClient } from '@/utils/supabase/admin'

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
