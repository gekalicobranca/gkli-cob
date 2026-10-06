import { createAdminClient } from '@/utils/supabase/admin'
import { brasiliaDay } from '../whatsapp-daily-summary'
import { workerStatus } from '../worker-status'
import { getWhatsAppCloudConfig } from './provider'

export async function loadCloudMonitor(walletId: string, now: Date, db = createAdminClient()) {
  const day = brasiliaDay(now)
  const base = () => db.from('mensagens').select('id', { count: 'exact', head: true }).eq('carteira_id', walletId).eq('canal', 'whatsapp').or('provider.is.null,provider.neq.whatsapp_web')
  const [worker, sent, queued, failed, delivered, last] = await Promise.all([
    db.from('agente_workers').select('ultimo_sinal_em,metadata_json').eq('script_key', 'mensageria:whatsapp').maybeSingle(),
    base().eq('provider', 'meta_cloud_api').gte('sent_at', day.start).lt('sent_at', day.end),
    base().eq('status', 'agendada').lte('agendada_para', now.toISOString()),
    base().eq('status', 'falha').or(`and(ultima_tentativa_em.gte.${day.start},ultima_tentativa_em.lt.${day.end}),and(provider_failed_at.gte.${day.start},provider_failed_at.lt.${day.end})`),
    base().eq('provider', 'meta_cloud_api').gte('provider_delivered_at', day.start).lt('provider_delivered_at', day.end),
    db.from('mensagens').select('provider_status,provider_error_message,provider_sent_at,provider_delivered_at,provider_read_at,provider_failed_at').eq('carteira_id', walletId).eq('provider', 'meta_cloud_api').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  for (const result of [worker, sent, queued, failed, delivered, last]) if (result.error) throw result.error
  let configured = true
  try { getWhatsAppCloudConfig() } catch { configured = false }
  const metadata = worker.data?.metadata_json as { estado?: string } | null
  const status = workerStatus(worker.data?.ultimo_sinal_em, metadata?.estado, now.getTime())
  return { configured, status, signal: worker.data?.ultimo_sinal_em ?? null, sent: sent.count ?? 0, queued: queued.count ?? 0, failed: failed.count ?? 0, delivered: delivered.count ?? 0, last: last.data }
}
