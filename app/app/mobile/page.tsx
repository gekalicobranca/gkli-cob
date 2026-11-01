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
    db.from('fechamento_periodos').select('data_abertura,data_fechamento').neq('status', 'cancelado').order('data_abertura', { ascending: false }).limit(30),
  ])
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const current = periodos.data?.find(p => p.data_abertura <= today && p.data_fechamento >= today)
  return <MobileConsulta userId={scope.userId}
    carteiras={carteiras.map(c => ({ id: c.id, nome: c.nome }))}
    condominios={condominios.map(c => ({ id: c.id, nome: c.nome_operacional || c.nome, carteiraId: c.carteira_id }))}
    initialPeriod={{ inicio: current?.data_abertura ?? today.slice(0, 8) + '01', fim: current?.data_fechamento ?? today }} />
}
