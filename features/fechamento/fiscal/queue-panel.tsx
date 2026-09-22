import { Card } from '@/components/ui/card'
import { createClient } from '@/utils/supabase/server'
import { fiscalConfig } from './client'
import { FiscalQueueButton } from './queue-button'

const labels: Record<string,string> = { pendente: 'Aguardando envio', processando: 'Processando', enviado: 'Recebida no Fiscal', erro: 'Pendente de entrega', conflito: 'Requer conciliação' }
export async function FiscalQueuePanel({ periodoId, status }: { periodoId: string; status: string }) {
  const db = await createClient()
  const [rows, ...counts] = await Promise.all([
    db.from('fiscal_core_envios').select('id,status,erro,ordem_core_id,source_id').eq('periodo_id',periodoId).order('updated_at',{ascending:false}).limit(10),
    ...['pendente','processando','enviado','erro','conflito'].map(value => db.from('fiscal_core_envios').select('id',{count:'exact',head:true}).eq('periodo_id',periodoId).eq('status',value)),
  ])
  const error = rows.error ?? counts.find(item => item.error)?.error
  if (error) return <Card><h2 className="text-base font-medium">Fiscal do Core</h2><p className="mt-1 text-sm text-amber-700">Fila indisponível. Verifique a aplicação da migração da integração e tente novamente.</p></Card>
  const configured = Boolean(fiscalConfig())
  return <Card className="space-y-3">
    <div><h2 className="text-base font-medium text-slate-950">Fiscal do Core</h2><p className="mt-1 text-sm text-slate-500">Ao fechar, as ordens entram na fila. Cada rodada envia até 20 itens; reenvios preservam a referência original.</p></div>
    <div className="flex flex-wrap gap-3 text-xs text-slate-600">{Object.entries(labels).map(([value,label],index) => <span key={value}>{label}: <strong>{counts[index].count ?? 0}</strong></span>)}</div>
    {!configured ? <p className="text-sm text-amber-700">Conexão com o Core ainda não configurada.</p> : null}
    <FiscalQueueButton periodoId={periodoId} disabled={!configured || status !== 'fechado'} />
    <p className="text-xs text-slate-500">A entrega cria uma ordem pendente de revisão. A emissão de nota permanece separada.</p>
    <div className="divide-y divide-slate-100">{(rows.data ?? []).map(row => <div key={row.id} className="py-2 text-xs">
      <p className="font-medium text-slate-700">{labels[row.status] ?? row.status}{row.ordem_core_id ? ` · Ordem ${row.ordem_core_id}` : ''}</p>
      <p className="break-all text-slate-400">{row.source_id}</p>{row.erro ? <p className="mt-1 text-amber-700">{row.erro}</p> : null}
    </div>)}</div>
    {(rows.data?.length ?? 0) >= 10 ? <p className="text-xs text-slate-500">Últimas 10 atualizações. Os totais consideram toda a fila autorizada.</p> : null}
  </Card>
}
