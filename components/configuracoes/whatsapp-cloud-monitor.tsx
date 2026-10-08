import { loadCloudMonitor } from '@/features/mensageria/whatsapp-cloud/monitor'
import { MetricCard } from '@/components/data/metric-card'

export async function WhatsappCloudMonitor({ walletId, enabled, ownPhone, now }: { walletId: string; enabled: boolean; ownPhone: boolean; now: Date }) {
  const monitor = await loadCloudMonitor(walletId, now).catch(error => { console.error('Monitor Meta indisponível:', error); return null })
  if (!monitor) return <p role="alert" className="border-t px-5 py-4 text-sm text-amber-800">Não foi possível consultar o monitoramento da API. Atualize para tentar novamente.</p>
  const ready = monitor.configured && ownPhone
  const tone = !enabled ? 'bg-slate-50 text-slate-600' : !ready || monitor.status.cor === 'vermelho' ? 'bg-rose-50 text-rose-800' : monitor.status.cor === 'verde' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'
  const format = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Sem registro'
  const labels: Record<string, string> = { accepted: 'Aceita pela Meta', sent: 'Enviada', delivered: 'Entregue', read: 'Lida', failed: 'Falha', retry_scheduled: 'Nova tentativa agendada' }
  return <div className="space-y-4 border-t border-slate-100 px-5 py-4">
    <p role="status" className={`rounded-lg px-3 py-2 text-sm font-semibold ${tone}`}>{!enabled ? 'Envios desabilitados' : !ready ? 'Configuração da API incompleta' : monitor.status.texto}</p>
    <p className="text-xs text-slate-600">Último sinal do processador compartilhado: {format(monitor.signal)} · Brasília. Esse sinal confirma a execução do processador; a entrega é confirmada pelos retornos da Meta.</p>
    {!ready ? <p className="text-sm text-amber-800">Verifique as credenciais da Meta e o identificador do número configurado para esta carteira.</p> : monitor.status.cor !== 'verde' ? <p className="text-sm text-amber-800">Verifique a execução do processador da API e os logs de disparo.</p> : null}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Aceitas hoje" value={monitor.sent} hint="Recebidas pela Meta para envio" />
      <MetricCard label="Aguardando envio" value={monitor.queued} hint="Agendas vencidas" />
      <MetricCard label="Falhas hoje" value={monitor.failed} />
      <MetricCard label="Entregues hoje" value={monitor.delivered} hint="Confirmadas pelo webhook da Meta" />
    </div>
    <p className="text-sm text-slate-600">Último resultado: {monitor.last ? labels[monitor.last.provider_status ?? ''] ?? 'Aguardando confirmação' : 'Nenhum envio registrado'}.</p>
    {monitor.last ? <p className="text-xs text-slate-500">Última confirmação da Meta: {format(monitor.last.provider_failed_at ?? monitor.last.provider_read_at ?? monitor.last.provider_delivered_at ?? monitor.last.provider_sent_at)} · Brasília</p> : null}
    {monitor.last?.provider_error_message ? <p role="alert" className="text-sm text-rose-800">Último erro: {monitor.last.provider_error_message}</p> : null}
  </div>
}
