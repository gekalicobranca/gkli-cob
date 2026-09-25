import { createAdminClient } from '@/utils/supabase/admin'
import { brasiliaDay, summarizeWhatsappDay } from './whatsapp-daily-summary'
import type { DailyAttempt } from './whatsapp-daily-summary'

export async function loadWhatsappDailySummary(now: Date) {
  const db = createAdminClient()
  const day = brasiliaDay(now)
  const wallets = await db.from('carteiras').select('id,whatsapp_web_sessao').eq('whatsapp_transporte', 'web')
  if (wallets.error) throw wallets.error
  const attempts: DailyAttempt[] = []
  const queue: { id: string; carteira_id: string }[] = []
  // Paginate so the dashboard remains accurate beyond Supabase's row limit.
  await Promise.all([
    (async () => {
      for (let offset = 0; ; offset += 1000) {
        const result = await db.from('whatsapp_web_envios').select('mensagem_id,sessao,estado,iniciado_em,finalizado_em,mensagem:mensagens(status)').or(`and(iniciado_em.gte.${day.start},iniciado_em.lt.${day.end}),and(finalizado_em.gte.${day.start},finalizado_em.lt.${day.end})`).order('token').range(offset, offset + 999)
        if (result.error) throw result.error
        attempts.push(...result.data)
        if (result.data.length < 1000) break
      }
    })(),
    (async () => {
      for (let offset = 0; ; offset += 1000) {
        const result = await db.from('mensagens').select('id,carteira_id').eq('canal', 'whatsapp').eq('status', 'agendada').lt('agendada_para', day.end).order('id').range(offset, offset + 999)
        if (result.error) throw result.error
        queue.push(...result.data)
        if (result.data.length < 1000) break
      }
    })(),
  ])
  return { ...day, ...summarizeWhatsappDay(attempts, queue, wallets.data, day.start, day.end) }
}
