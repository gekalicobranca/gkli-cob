import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCondominios } from '@/features/condominios/queries'
import { listCarteiras } from '@/features/carteiras/queries'
import { createClient } from '@/utils/supabase/server'
import { MobileConsulta } from '@/features/mobile/mobile-consulta'

export default async function MobilePage() {
  const scope = await getPermittedCarteiras()
  const db = await createClient()
  const [condominios, carteiras, periodos] = await Promise.all([
    listCondominios(scope, {}, { all: true }), listCarteiras(scope),
    db.from('fechamento_periodos').select('id,competencia,data_abertura,data_fechamento').neq('status', 'cancelado').order('data_abertura', { ascending: false }),
  ])
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  if (periodos.error) throw new Error('Não foi possível consultar os períodos de fechamento.')
  const current = periodos.data?.find(p => p.data_abertura <= today && p.data_fechamento >= today) ?? periodos.data?.find(p => p.data_abertura <= today) ?? periodos.data?.[0]
  return <MobileConsulta userId={scope.userId}
    carteiras={carteiras.map(c => ({ id: c.id, nome: c.nome }))}
    condominios={condominios.map(c => ({ id: c.id, nome: c.nome_operacional || c.nome, carteiraId: c.carteira_id }))}
    periodos={(periodos.data ?? []).map(p => ({ id: p.id, competencia: p.competencia, inicio: p.data_abertura, fim: p.data_fechamento }))}
    initialPeriodId={current?.id ?? ''} />
}
