import { MaestroAtivacaoControle } from './maestro-ativacao-controle'
import Link from 'next/link'
import { createAdminClient } from '@/utils/supabase/admin'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import { Card } from '@/components/ui/card'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { retomarMontagemMaestro } from '@/features/flows/cobranca/maestro-actions'
import { classificarPendenciasMaestro } from '@/features/flows/cobranca/maestro-elegibilidade'
import { MaestroRefresh } from './maestro-refresh'

type FiltrosMontagem = { condominioIds?: string[]; carteiraId?: string; status?: string; mostrarVazio?: boolean }
export async function MaestroMontagens(props: FiltrosMontagem = {}) {
  return <><MaestroAtivacaoControle carteiraId={props.carteiraId} /><Montagens {...props} /></>
}
async function Montagens({ condominioIds, carteiraId, status, mostrarVazio = false }: { condominioIds?: string[]; carteiraId?: string; status?: string; mostrarVazio?: boolean } = {}) {
  const scope = await getPermittedCarteiras()
  const db = createAdminClient()
  let query = applyCarteiraScope(db.from('maestro_flow_montagens')
    .select('id,condominio_id,status,parte,plano,flow_ids,pendencias,erro,condominio:condominios(nome,nome_operacional)', { count: 'exact' }), scope.carteiraIds)
    .order('updated_at', { ascending: false }).limit(100)
  if (condominioIds) query = query.in('condominio_id', condominioIds.length ? condominioIds : ['00000000-0000-0000-0000-000000000000'])
  if (carteiraId) query = query.eq('carteira_id', carteiraId)
  query = status === 'arquivado' ? query.not('arquivado_em', 'is', null) : query.is('arquivado_em', null)
  if (status && ['pendente', 'processando', 'concluido', 'atencao'].includes(status)) query = query.eq('status', status)
  const { data, error, count } = await query
  if (error) return <Card><p className="text-sm text-amber-800">Não foi possível consultar a montagem automática dos flows.</p></Card>
  if (!data?.length) return mostrarVazio ? <Card><p className="text-sm text-slate-500">Nenhuma montagem de flows encontrada para estes filtros.</p></Card> : null
  const flowsPorCondominio = new Map<string, { id: string; status: string }[]>()
  const idsEncontrados = [...new Set<string>(data.map((job: any) => job.condominio_id))]
  let flowsIndisponiveis = false
  for (let offset = 0; ; offset += 500) {
    const { data: flows, error: flowsError } = await applyCarteiraScope(db.from('cobranca_flows')
      .select('id,status,payload').in('payload->>condominio_id', idsEncontrados), scope.carteiraIds)
      .order('id').range(offset, offset + 499)
    if (flowsError) { flowsIndisponiveis = true; break }
    for (const flow of flows ?? []) {
      const id = String((flow.payload as any)?.condominio_id ?? '')
      if (!flowsPorCondominio.has(id)) flowsPorCondominio.set(id, [])
      flowsPorCondominio.get(id)!.push(flow)
    }
    if ((flows?.length ?? 0) < 500) break
  }
  const labels: Record<string,string> = { pendente: 'Na fila', processando: 'Montando flows', concluido: 'Montagem concluída', atencao: 'Requer atenção' }
  return <Card className="space-y-3">
    <MaestroRefresh ativo={data.some((job: any) => ['pendente', 'processando'].includes(job.status))} />
    <div><h2 className="font-semibold">Montagem de flows pelo Maestro</h2><p className="text-sm text-slate-500">A montagem continua com a página fechada. Os flows aguardam sua revisão e ativação manual em lote.</p></div>
    <div className="divide-y divide-slate-100">{data.map((job: any) => {
      const condominio = Array.isArray(job.condominio) ? job.condominio[0] : job.condominio
      const partes = job.plano?.length ?? 0
      const { pendencias, vinculadas, excluidas } = classificarPendenciasMaestro(job.pendencias ?? [])
      const flows = flowsPorCondominio.get(job.condominio_id) ?? []
      const destaMontagem = flows.filter(flow => (job.flow_ids ?? []).includes(flow.id)).length
      const prontos = flows.filter(flow => flow.status === 'pronto').length
      return <div key={job.id} className="space-y-2 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div>
          <p className="text-sm font-medium">{condominio?.nome_operacional || condominio?.nome}</p>
          <p className="text-xs text-slate-500">{labels[job.status]}{partes > 0 ? ` · ${job.parte}/${partes} partes` : job.status === 'concluido' ? ' · Nenhuma nova cobrança elegível nesta avaliação' : ''}</p>
        </div>
        {job.status === 'atencao' || (job.status === 'concluido' && pendencias.length > 0) ? <form action={retomarMontagemMaestro.bind(null, job.id)}><PendingSubmitButton variant="secondary" size="sm" pendingLabel="Enfileirando...">{job.status === 'atencao' ? 'Retomar montagem' : 'Reavaliar pendências'}</PendingSubmitButton></form> : null}</div>
        <p className="text-xs text-slate-600">{flowsIndisponiveis ? 'Total de flows temporariamente indisponível.' : `${flows.length} flow(s) no condomínio · ${destaMontagem} desta montagem do Maestro · ${flows.length - destaMontagem} de outras montagens, inclusive manuais · ${prontos} pronto(s) para ativar`}</p>
        {vinculadas.length ? <p className="text-xs text-emerald-700">{vinculadas.length} cobrança(s) já incluída(s) em flows na última avaliação.</p> : null}
        {job.erro ? <p className="text-sm text-rose-700">{job.erro}</p> : null}
        {pendencias.length ? <details className="text-xs text-slate-600"><summary className="cursor-pointer">{pendencias.length} cobrança(s) com pendências de responsável ou e-mail</summary><p className="mt-2">Após corrigir o cadastro, use Reavaliar pendências.</p><ul className="mt-2 space-y-1">{pendencias.map((p, index) => <li key={index}><Link href={`/app/cobrancas/${p.cobranca_id}`} className="underline">Abrir cobrança</Link> · {p.motivo}</li>)}</ul></details> : null}
        {excluidas.length ? <details className="text-xs text-slate-500"><summary className="cursor-pointer">{excluidas.length} cobrança(s) não incluída(s) por outros motivos</summary><ul className="mt-2 space-y-1">{excluidas.map((p, index) => <li key={index}><Link href={`/app/cobrancas/${p.cobranca_id}`} className="underline">Abrir cobrança</Link> · {p.motivo}</li>)}</ul></details> : null}
      </div>
    })}</div>
    {(count ?? 0) > data.length ? <p className="text-xs text-slate-500">Mostrando as 100 montagens atualizadas mais recentemente.</p> : null}
    <Link href="/app/flows/cobranca/email?step=flows" className="text-sm font-medium underline">Revisar e ativar flows em lote</Link>
  </Card>
}
