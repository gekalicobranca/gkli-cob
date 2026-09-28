'use server'
import { requireAdmin } from '@/utils/auth/require-admin'
import { createAdminClient } from '@/utils/supabase/admin'
import { pairingView, type PairingView } from './whatsapp-pairing-state'

async function lookup(sessao: string) {
  if (!/^[a-zA-Z0-9_-]{1,60}$/.test(sessao)) throw new Error('Sessão inválida.')
  const db = createAdminClient()
  const wallet = await db.from('carteiras').select('id').eq('whatsapp_web_sessao', sessao).eq('whatsapp_transporte', 'web').limit(1)
  if (wallet.error || !wallet.data?.length) throw new Error('Sessão não configurada para WhatsApp Web.')
  const [control, session] = await Promise.all([
    db.from('whatsapp_worker_controles').select('habilitado,atualizado_em,reiniciar_id,aplicado_id,supervisor_em,vinculacao_pedido,vinculacao_modo,vinculacao_payload,vinculacao_expira_em').eq('sessao', sessao).maybeSingle(),
    db.from('whatsapp_web_sessoes').select('status,atualizado_em').eq('id', sessao).maybeSingle(),
  ])
  if (control.error || session.error) throw new Error('Não foi possível consultar a vinculação. Tente novamente.')
  return { db, view: pairingView(control.data, session.data) }
}
export async function consultarVinculacaoWhatsapp(sessao: string): Promise<PairingView> {
  await requireAdmin()
  return (await lookup(sessao)).view
}
export async function solicitarVinculacaoWhatsapp(sessao: string, mode: 'qr' | 'codigo'): Promise<PairingView> {
  const user = await requireAdmin()
  if (!['qr', 'codigo'].includes(mode)) throw new Error('Modo de vinculação inválido.')
  const { db, view } = await lookup(sessao)
  if (['connected', 'paused', 'offline'].includes(view.status)) return view
  if (view.status === 'waiting') return view
  const busy = await db.from('whatsapp_web_envios').select('token').eq('sessao', sessao).eq('estado', 'reservado').limit(1)
  if (busy.error || busy.data?.length) throw new Error('Aguarde o envio em andamento antes de solicitar a vinculação.')
  const requestId = crypto.randomUUID()
  const result = await db.from('whatsapp_worker_controles').update({
    vinculacao_modo: mode, vinculacao_pedido: requestId, vinculacao_payload: null, vinculacao_expira_em: null,
    reiniciar_id: requestId, solicitado_por: user.id, atualizado_em: new Date().toISOString(),
  }).eq('sessao', sessao).eq('habilitado', true).select('sessao')
  if (result.error || !result.data?.length) throw new Error('Não foi possível solicitar a vinculação.')
  return { status: 'waiting', mode, message: 'Solicitação enviada. Aguarde o notebook gerar a vinculação…' }
}
