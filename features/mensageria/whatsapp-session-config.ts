import type { SupabaseClient } from '@supabase/supabase-js'

export async function assertWhatsappSessionConfigured(db: SupabaseClient, sessao: string) {
  const wallet = await db.from('carteiras').select('id')
    .eq('whatsapp_web_sessao', sessao).eq('whatsapp_transporte', 'web').limit(1)
  if (wallet.error) throw new Error('Não foi possível consultar a sessão.')
  if (wallet.data?.length) return
  const route = await db.from('whatsapp_web_rotas_grupo').select('carteira_id')
    .eq('sessao', sessao).eq('ativo', true).maybeSingle()
  if (route.error || !route.data) throw new Error('Sessão não configurada para WhatsApp Web.')
  const owner = await db.from('carteiras').select('id').eq('id', route.data.carteira_id)
    .eq('whatsapp_transporte', 'web').maybeSingle()
  if (owner.error || !owner.data) throw new Error('Carteira da sessão indisponível.')
}
