import { listLotesRegua } from '@/features/lotes/queries'
import { listReguasForSelect } from '@/features/reguas/queries'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'
import { listPreJuridicoCasos } from './queries'

const relation = (value: any) => Array.isArray(value) ? value[0] : value

export async function getPreJuridicoFlowPageData(scope: CarteiraScope) {
  const supabase = createAdminClient()
  const [casos, reguas, lotes] = await Promise.all([
    listPreJuridicoCasos(scope),
    listReguasForSelect(scope, 'juridico'),
    listLotesRegua(scope, { tipo: 'pre_juridico' }),
  ])

  const disponibilidade = (casos as any[]).filter((caso) =>
    caso.etapa === 'aguardando_sindico' &&
    caso.procuracao_status === 'gerada' &&
    !caso.procuracao_lote_id &&
    !caso.procuracao_flow_id &&
    caso.cobranca_id,
  )

  let flowsQuery = supabase
    .from('pre_juridico_flows')
    .select(`
      id,
      nome,
      carteira_id,
      lote_id,
      regua_id,
      status,
      total_mensagens,
      total_pendentes,
      total_agendadas,
      total_enviadas,
      total_falhas,
      proximo_disparo_em,
      iniciado_em,
      pausado_em,
      cancelado_em,
      concluido_em,
      created_at,
      updated_at,
      payload,
      carteira:carteiras(nome),
      regua:reguas(nome),
      lote:lotes(id,status,total_avaliadas,total_criadas,total_pendentes,total_enviadas,total_erros)
    `)
    .order('created_at', { ascending: false })
    .limit(100)
  flowsQuery = applyCarteiraScope(flowsQuery, scope.carteiraIds)

  const { data: flows, error } = await flowsQuery
  if (error && error.code !== '42P01') throw new Error(`Erro ao carregar Flows pré-jurídicos: ${error.message}`)

  return {
    disponibilidade: disponibilidade.map((caso) => ({
      ...caso,
      carteira: relation(caso.carteira),
      condominio: relation(caso.condominio),
      unidade: relation(caso.unidade),
      cobranca: relation(caso.cobranca),
    })),
    reguas,
    lotes,
    flows: flows ?? [],
  }
}
