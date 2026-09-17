import Link from 'next/link'
import { createAdminClient } from '@/utils/supabase/admin'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import { Card } from '@/components/ui/card'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { retomarMontagemMaestro } from '@/features/flows/cobranca/maestro-actions'
import { MaestroRefresh } from './maestro-refresh'

export async function MaestroMontagens() {
  const scope = await getPermittedCarteiras()
  const { data, error, count } = await applyCarteiraScope(createAdminClient().from('maestro_flow_montagens')
    .select('id,status,parte,plano,flow_ids,pendencias,erro,condominio:condominios(nome,nome_operacional)', { count: 'exact' }), scope.carteiraIds)
    .order('updated_at', { ascending: false }).limit(100)
  if (error) return <Card><p className="text-sm text-amber-800">Não foi possível consultar a montagem automática dos flows.</p></Card>
  if (!data?.length) return null
  const labels: Record<string,string> = { pendente: 'Na fila', processando: 'Montando flows', concluido: 'Montagem concluída', atencao: 'Requer atenção' }
  return <Card className="space-y-3">
    <MaestroRefresh ativo={data.some(job => ['pendente', 'processando'].includes(job.status))} />
    <div><h2 className="font-semibold">Montagem de flows pelo Maestro</h2><p className="text-sm text-slate-500">A montagem continua com a página fechada. Os flows aguardam sua revisão e ativação manual em lote.</p></div>
    <div className="divide-y divide-slate-100">{data.map((job: any) => {
      const condominio = Array.isArray(job.condominio) ? job.condominio[0] : job.condominio
      return <div key={job.id} className="space-y-2 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div>
          <p className="text-sm font-medium">{condominio?.nome_operacional || condominio?.nome}</p>
          <p className="text-xs text-slate-500">{labels[job.status]} · {job.parte}/{job.plano?.length ?? 0} partes · {job.flow_ids.length} Flow(s)</p>
        </div>
        {['atencao', 'concluido'].includes(job.status) ? <form action={retomarMontagemMaestro.bind(null, job.id)}><PendingSubmitButton variant="secondary" size="sm" pendingLabel="Enfileirando...">{job.status === 'atencao' ? 'Retomar montagem' : 'Reavaliar pendências'}</PendingSubmitButton></form> : null}</div>
        {job.erro ? <p className="text-sm text-rose-700">{job.erro}</p> : null}
        {job.pendencias.length ? <details className="text-xs text-slate-600"><summary className="cursor-pointer">{job.pendencias.length} cobrança(s) fora dos envios / pendências</summary><ul className="mt-2 space-y-1">{job.pendencias.map((p: any, index: number) => <li key={index}><Link href={`/app/cobrancas/${p.cobranca_id}`} className="underline">Abrir cobrança</Link> · {p.motivo}{p.saneamento ? ' · Saneamento' : ''}</li>)}</ul></details> : null}
      </div>
    })}</div>
    {(count ?? 0) > data.length ? <p className="text-xs text-slate-500">Mostrando as 100 montagens atualizadas mais recentemente.</p> : null}
    <Link href="/app/flows/cobranca?step=flows" className="text-sm font-medium underline">Revisar e ativar flows em lote</Link>
  </Card>
}
