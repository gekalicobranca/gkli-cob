import { createAdminClient } from '@/utils/supabase/admin'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import { Card } from '@/components/ui/card'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { configurarAtivacaoMaestro, retomarAtivacaoMaestro } from '@/features/flows/cobranca/maestro-actions'
import { MaestroRefresh } from './maestro-refresh'

export async function MaestroAtivacaoControle({ carteiraId }: { carteiraId?: string }) {
  const scope = await getPermittedCarteiras()
  const db = createAdminClient()
  let carteirasQuery = applyCarteiraScope(db.from('carteiras').select('id,nome').order('nome'), scope.carteiraIds, 'id')
  if (carteiraId) carteirasQuery = carteirasQuery.eq('id', carteiraId)
  const { data: carteiras, error } = await carteirasQuery
  if (error || !carteiras?.length) return null
  const ids = carteiras.map((c: any) => c.id)
  const [{ data: controles, error: ce }, { data: fila, error: fe }] = await Promise.all([
    db.from('maestro_flow_controle').select('carteira_id,ativo').in('carteira_id', ids),
    db.from('maestro_flow_ativacoes').select('flow_id,status,erro,flow:cobranca_flows(nome)').in('carteira_id', ids).in('status', ['pendente', 'atencao']).order('created_at').limit(100),
  ])
  if (ce || fe) return <Card>Não foi possível consultar a ativação automática.</Card>
  const habilitadas = new Set((controles ?? []).filter(c => c.ativo).map(c => c.carteira_id))
  return <Card className="space-y-3">
    <MaestroRefresh ativo={Boolean(fila?.some(f => f.status === 'pendente'))} />
    <h2 className="font-semibold">Ativação automática por carteira</h2>
    <p className="text-sm text-slate-500">Aplica-se aos novos flows de e-mail montados pelo Maestro. A agenda respeita os limites da carteira e do remetente. Flows anteriores continuam com ativação manual. Pausar impede novas ativações; envios já agendados são controlados no próprio flow.</p>
    <details><summary className="cursor-pointer text-sm">{habilitadas.size} de {carteiras.length} carteira(s) com ativação automática ligada · Configurar</summary>
      <div className="divide-y">{carteiras.map((c: any) => <div key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
        <span>{c.nome} · {habilitadas.has(c.id) ? 'Ligada' : 'Pausada'}</span>
        {['admin', 'gestor'].includes(scope.perfil) ? <form action={configurarAtivacaoMaestro.bind(null, c.id, !habilitadas.has(c.id))}><PendingSubmitButton variant="secondary" size="sm" pendingLabel="Salvando...">{habilitadas.has(c.id) ? 'Pausar' : 'Ligar'}</PendingSubmitButton></form> : null}
      </div>)}</div>
    </details>
    {fila?.length ? <details open><summary className="cursor-pointer text-sm">Ativações aguardando processamento ou conferência ({fila.length}{fila.length === 100 ? '+' : ''})</summary>
      <ul className="space-y-2 pt-2">{fila.map((item: any) => <li key={item.flow_id} className="text-sm">
        <p>{(Array.isArray(item.flow) ? item.flow[0] : item.flow)?.nome} · {item.status === 'atencao' ? 'Requer atenção' : 'Aguardando ativação (respeita as pausas)'}</p>
        {item.erro ? <p className="text-rose-700">{item.erro}</p> : null}
        {item.status === 'atencao' ? <form action={retomarAtivacaoMaestro.bind(null, item.flow_id)}><PendingSubmitButton variant="secondary" size="sm" pendingLabel="Enfileirando...">Tentar novamente após correção</PendingSubmitButton></form> : null}
      </li>)}</ul>
    </details> : null}
  </Card>
}
