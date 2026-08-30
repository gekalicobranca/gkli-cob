import { listLotesRegua } from '@/features/lotes/queries'
import { listReguasForSelect } from '@/features/reguas/queries'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'
import { listPreJuridicoCasos } from './queries'

const relation = (value: any) => Array.isArray(value) ? value[0] : value

export async function getPreJuridicoFlowItens(scope: CarteiraScope, flowId: string) {
  const supabase = createAdminClient()

  let flowQuery = supabase
    .from('pre_juridico_flows')
    .select('id,carteira_id')
    .eq('id', flowId)
    .maybeSingle()
  flowQuery = applyCarteiraScope(flowQuery, scope.carteiraIds)

  const { data: flow, error: flowError } = await flowQuery
  if (flowError) throw new Error(`Erro ao validar Flow pré-jurídico: ${flowError.message}`)
  if (!flow) throw new Error('Flow pré-jurídico não encontrado.')

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
    .eq('pre_juridico_flow_id', flowId)
    .order('created_at', { ascending: true })
    .limit(1000)

  if (itensError) throw new Error(`Erro ao carregar itens do Flow pré-jurídico: ${itensError.message}`)

  return ((itens ?? []) as any[]).map((item) => ({
    ...item,
    cobranca: relation(item.cobranca),
    acordo: relation(item.acordo),
    mensagem: relation(item.mensagem),
  }))
}

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
      carteira: relation(flow.carteira),
      regua: relation(flow.regua),
      lote: relation(flow.lote),
      itens: [],
    })),
  }
}
