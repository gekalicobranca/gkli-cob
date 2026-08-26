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

  const flowRows = (flows ?? []) as any[]
  const flowIds = flowRows.map((flow) => flow.id).filter(Boolean)
  let itensPorFlow = new Map<string, any[]>()

  if (flowIds.length) {
    const { data: itens, error: itensError } = await supabase
      .from('lote_itens')
      .select(`
        id,
        lote_id,
        pre_juridico_flow_id,
        cobranca_id,
        acordo_id,
        status,
        motivo,
        payload,
        created_at,
        cobranca:cobrancas(
          id,
          valor_original,
          valor_atualizado,
          vencimento,
          unidade:unidades(
            id,
            identificacao,
            responsavel_nome,
            condominio:condominios(
              id,
              nome,
              nome_operacional
            )
          )
        ),
        acordo:acordos(
          id,
          valor_acordado,
          data_acordo,
          unidade:unidades(
            id,
            identificacao,
            responsavel_nome,
            condominio:condominios(
              id,
              nome,
              nome_operacional
            )
          )
        ),
        mensagem:mensagens!lote_itens_mensagem_id_fkey(
          id,
          canal,
          status,
          status_operacional,
          destinatario,
          email_destinatario,
          email_assunto,
          scheduled_at,
          agendada_para,
          sent_at,
          enviada_em,
          erro,
          erro_envio,
          created_at
        )
      `)
      .in('pre_juridico_flow_id', flowIds)
      .order('created_at', { ascending: true })
      .limit(1000)

    if (itensError) throw new Error(`Erro ao carregar itens dos Flows pré-jurídicos: ${itensError.message}`)

    itensPorFlow = (itens ?? []).reduce((map, item: any) => {
      const flowId = String(item.pre_juridico_flow_id ?? '')
      if (!flowId) return map
      const list = map.get(flowId) ?? []
      list.push({
        ...item,
        cobranca: relation(item.cobranca),
        acordo: relation(item.acordo),
        mensagem: relation(item.mensagem),
      })
      map.set(flowId, list)
      return map
    }, new Map<string, any[]>())
  }

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
    flows: flowRows.map((flow) => ({
      ...flow,
      itens: itensPorFlow.get(flow.id) ?? [],
    })),
  }
}
