import { createAdminClient } from '@/utils/supabase/admin'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { Card } from '@/components/ui/card'

const relation = (v: any) => Array.isArray(v) ? v[0] : v
const dataBR = (v: string) => new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

export async function FlowProgressao({ scope, canal, carteiraId, condominioId }: {
  scope: CarteiraScope; canal: string; carteiraId?: string; condominioId?: string
}) {
  const db = createAdminClient()
  let query = applyCarteiraScope(db.from('flow_progressao').select(
    'id,status,primeiro_envio_em,prevista_em,erro,etapa:regua_etapas!inner(delay_dias,canal),condominio:condominios(nome,nome_operacional),flow:cobranca_flows!flow_progressao_flow_origem_id_fkey(status)',
    { count: 'exact' }), scope.carteiraIds)
    .in('status', ['pendente', 'processando', 'atencao']).eq('etapa.canal', canal)
    .order('prevista_em').limit(50)
  if (carteiraId) query = query.eq('carteira_id', carteiraId)
  if (condominioId) query = query.eq('condominio_id', condominioId)
  const { data, error, count } = await query
  if (error) return <Card className="p-4 text-sm text-amber-800">Não foi possível consultar as próximas etapas automáticas.</Card>
  if (!data?.length) return null
  return <Card className="p-4">
    <details>
      <summary className="cursor-pointer font-medium">Próximas etapas automáticas ({count})</summary>
      <p className="mt-2 text-sm text-slate-600">Prazos contados do primeiro envio confirmado. O envio respeita a agenda do canal e a situação atual da cobrança. Um Flow encerrado pode ter uma próxima etapa aguardando aqui.</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr><th className="p-2">Condomínio</th><th className="p-2">Etapa</th><th className="p-2">Primeiro envio</th><th className="p-2">A partir de</th><th className="p-2">Situação</th></tr></thead>
        <tbody>{data.map(row => {
          const condominio = relation(row.condominio)
          const flow = relation(row.flow)
          return <tr key={row.id} className="border-t"><td className="p-2">{condominio?.nome_operacional || condominio?.nome}</td>
            <td className="p-2">D+{relation(row.etapa)?.delay_dias}</td><td className="p-2">{dataBR(row.primeiro_envio_em)}</td>
            <td className="p-2">{dataBR(row.prevista_em)}</td><td className="p-2">{row.erro || (flow?.status === 'pausado' ? 'Flow de origem pausado' : row.status === 'processando' ? 'Preparando' : new Date(row.prevista_em).getTime() <= Date.now() ? 'Aguardando processamento' : 'Aguardando prazo')}</td></tr>
        })}</tbody>
      </table></div>
      {(count ?? 0) > 50 ? <p className="mt-2 text-sm">Exibindo as primeiras 50 etapas. Filtre a carteira ou condomínio para refinar.</p> : null}
    </details>
  </Card>
}
