'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { criarLotesPreJuridico } from '@/features/acordos/pre-juridico-lote'
import { registrarLogMensageria } from '@/features/mensageria/engine/logs'
import { registrarEventoOperacional } from '@/features/operacional/service'
import { LOTE_ITEM_STATUS, LOTE_STATUS, MENSAGEM_STATUS } from '@/lib/core/status'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import { getPermittedCarteiras, type CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { requireRole } from '@/utils/auth/require-role'
import { requireUser } from '@/utils/auth/require-user'
import { createAdminClient } from '@/utils/supabase/admin'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

function assertCarteiraPermitida(scope: CarteiraScope, carteiraId: string | null | undefined) {
  if (!carteiraId) throw new Error('Carteira do Flow não identificada.')
  if (scope.carteiraIds !== null && !scope.carteiraIds.includes(carteiraId)) {
    throw new Error('Você não tem acesso à carteira deste Flow.')
  }
}

function agendamentoPreJuridico(payload: unknown, base = new Date()) {
  const etapa = payload && typeof payload === 'object' ? (payload as any).etapa : null
  const delayDias = Math.max(0, Number(etapa?.delay_dias ?? 0) || 0)
  return new Date(base.getTime() + delayDias * 86_400_000).toISOString()
}

function flowNome(carteiraNome: string | null | undefined, loteId: string) {
  const carteira = String(carteiraNome ?? 'Carteira').trim() || 'Carteira'
  return `Flow pré-jurídico · ${carteira} · lote ${loteId.slice(0, 8)}`
}

async function getFlow(supabase: SupabaseAdmin, flowId: string, scope: CarteiraScope) {
  let query = supabase
    .from('pre_juridico_flows')
    .select('id,carteira_id,lote_id,regua_id,status,nome,total_mensagens')
    .eq('id', flowId)
    .maybeSingle()
  query = applyCarteiraScope(query, scope.carteiraIds)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar Flow pré-jurídico: ${error.message}`)
  if (!data) throw new Error('Flow pré-jurídico não encontrado.')
  assertCarteiraPermitida(scope, (data as any).carteira_id)
  return data as any
}

export async function recalcularFlowPreJuridico(supabase: SupabaseAdmin, flowId: string) {
  const { data: flow } = await supabase
    .from('pre_juridico_flows')
    .select('id,status')
    .eq('id', flowId)
    .maybeSingle()
  if (!flow || ['cancelado', 'pausado'].includes(String((flow as any).status))) return

  const { data, error } = await supabase
    .from('mensagens')
    .select('status,agendada_para,scheduled_at')
    .eq('pre_juridico_flow_id', flowId)
  if (error) throw new Error(`Erro ao recalcular Flow pré-jurídico: ${error.message}`)

  const rows = (data ?? []) as any[]
  const total = rows.length
  const pendentes = rows.filter((row) => row.status === MENSAGEM_STATUS.PENDENTE_APROVACAO || row.status === MENSAGEM_STATUS.APROVADA).length
  const agendadas = rows.filter((row) => row.status === MENSAGEM_STATUS.AGENDADA).length
  const enviadas = rows.filter((row) => row.status === MENSAGEM_STATUS.ENVIADA).length
  const falhas = rows.filter((row) => row.status === MENSAGEM_STATUS.FALHA).length
  const proximo = rows
    .filter((row) => row.status === MENSAGEM_STATUS.AGENDADA && (row.agendada_para || row.scheduled_at))
    .map((row) => String(row.agendada_para || row.scheduled_at))
    .sort()[0] ?? null
  const concluido = total > 0 && pendentes + agendadas === 0
  const status = concluido ? (falhas > 0 ? 'concluido_com_falhas' : 'concluido') : 'em_execucao'

  const { error: updateError } = await supabase
    .from('pre_juridico_flows')
    .update({
      status,
      total_mensagens: total,
      total_pendentes: pendentes,
      total_agendadas: agendadas,
      total_enviadas: enviadas,
      total_falhas: falhas,
      proximo_disparo_em: proximo,
      concluido_em: concluido ? new Date().toISOString() : null,
    } as any)
    .eq('id', flowId)
  if (updateError) throw new Error(`Erro ao atualizar Flow pré-jurídico: ${updateError.message}`)
}

export async function criarFlowsPreJuridico(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const supabase = createAdminClient()
  const casoIds = Array.from(new Set(formData.getAll('caso_id').map(String).map((id) => id.trim()).filter(Boolean)))
  if (!casoIds.length) throw new Error('Selecione ao menos uma procuração gerada.')

  let query = supabase
    .from('pre_juridico_casos')
    .select('id,carteira_id,cobranca_id,etapa,procuracao_status,procuracao_lote_id,procuracao_flow_id,carteira:carteiras(nome)')
    .in('id', casoIds)
  query = applyCarteiraScope(query, scope.carteiraIds)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar casos para Flow: ${error.message}`)
  const casos = (data ?? []) as any[]
  if (casos.length !== casoIds.length || casos.some((caso) => caso.etapa !== 'aguardando_sindico' || caso.procuracao_status !== 'gerada' || caso.procuracao_lote_id || caso.procuracao_flow_id || !caso.cobranca_id)) {
    throw new Error('Uma ou mais procurações não estão disponíveis para criar Flow.')
  }

  const reguaIdPorCarteira: Record<string, string> = {}
  for (const caso of casos) {
    const carteiraId = String(caso.carteira_id ?? '')
    const reguaId = String(formData.get(`regua_id:${carteiraId}`) ?? '').trim()
    if (!reguaId) throw new Error('Selecione a régua de cada lote antes de criar o Flow.')
    reguaIdPorCarteira[carteiraId] = reguaId
  }

  const resultado = await criarLotesPreJuridico({
    cobrancaIds: casos.map((caso) => caso.cobranca_id),
    scope,
    userId: user.id,
    reguaIdPorCarteira,
  })

  const agora = new Date().toISOString()
  const flowIds: string[] = []
  for (const item of resultado.resultados) {
    const primeiroCaso = casos.find((caso) => item.entidadeIds.includes(caso.cobranca_id))
    const carteira = Array.isArray(primeiroCaso?.carteira) ? primeiroCaso.carteira[0] : primeiroCaso?.carteira
    const { data: flow, error: flowError } = await supabase
      .from('pre_juridico_flows')
      .insert({
        carteira_id: item.carteiraId,
        lote_id: item.loteId,
        regua_id: item.reguaId,
        nome: flowNome(carteira?.nome, item.loteId),
        status: 'pronto',
        total_mensagens: item.counters.criadas,
        total_pendentes: item.counters.criadas,
        criado_por: user.id,
        atualizado_por: user.id,
        payload: {
          contexto: 'pre_juridico',
          caso_ids: casos.filter((caso) => item.entidadeIds.includes(caso.cobranca_id)).map((caso) => caso.id),
          cobranca_ids: item.entidadeIds,
          etapas: item.etapas.map((etapa) => ({
            id: etapa.id,
            ordem: etapa.ordem,
            nome: etapa.nome,
            canal: etapa.canal,
            delay_dias: etapa.delay_dias,
            categoria_template: etapa.categoria_template,
          })),
        },
      } as any)
      .select('id')
      .single()
    if (flowError || !flow?.id) throw new Error(`Erro ao criar Flow pré-jurídico: ${flowError?.message ?? 'Flow não retornado'}`)
    flowIds.push(flow.id)

    await supabase.from('mensagens').update({ pre_juridico_flow_id: flow.id } as any).eq('lote_id', item.loteId)
    await supabase.from('lote_itens').update({ pre_juridico_flow_id: flow.id } as any).eq('lote_id', item.loteId)
    const casosDoFlow = casos.filter((caso) => item.entidadeIds.includes(caso.cobranca_id)).map((caso) => caso.id)
    const { error: vinculoError } = await supabase
      .from('pre_juridico_casos')
      .update({
        procuracao_lote_id: item.loteId,
        procuracao_lote_criado_em: agora,
        procuracao_flow_id: flow.id,
        responsavel_id: user.id,
      } as any)
      .in('id', casosDoFlow)
    if (vinculoError) throw new Error(`Flow criado, mas não foi possível vincular os casos: ${vinculoError.message}`)

    await registrarEventoOperacional(supabase as any, {
      carteiraId: item.carteiraId,
      entidadeTipo: 'lote',
      entidadeId: item.loteId,
      eventoCodigo: 'pre_juridico.flow_criado',
      titulo: 'Flow pré-jurídico criado',
      descricao: 'Lote e régua foram vinculados para disparo monitorado.',
      severidade: 'info',
      origem: 'manual',
      auditavel: true,
      userId: user.id,
      payload: { flow_id: flow.id, lote_id: item.loteId, regua_id: item.reguaId, total_mensagens: item.counters.criadas },
    })
  }

  revalidatePath('/app/pre-juridico/flow')
  revalidatePath('/app/pre-juridico/lotes')
  revalidatePath('/app/pre-juridico/processamento')
  redirect(`/app/pre-juridico/flow?step=flows&criados=${flowIds.length}`)
}

export async function enviarFlowPreJuridico(flowId: string) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const supabase = createAdminClient()
  const flow = await getFlow(supabase, flowId, scope)
  const agora = new Date().toISOString()

  if (flow.status === 'pausado') {
    const { error } = await supabase
      .from('pre_juridico_flows')
      .update({ status: 'em_execucao', pausado_em: null, atualizado_por: user.id } as any)
      .eq('id', flowId)
    if (error) throw new Error(`Erro ao retomar Flow: ${error.message}`)
    await recalcularFlowPreJuridico(supabase, flowId)
  } else {
    if (flow.status !== 'pronto') throw new Error('Este Flow não está pronto para envio.')
    const { data: mensagens, error: mensagensError } = await supabase
      .from('mensagens')
      .select('id,payload')
      .eq('pre_juridico_flow_id', flowId)
      .in('status', [MENSAGEM_STATUS.PENDENTE_APROVACAO, MENSAGEM_STATUS.APROVADA, MENSAGEM_STATUS.FALHA])
    if (mensagensError) throw new Error(`Erro ao carregar mensagens do Flow: ${mensagensError.message}`)
    if (!(mensagens ?? []).length) throw new Error('Este Flow não possui mensagens pendentes para enviar.')

    for (const mensagem of (mensagens ?? []) as any[]) {
      const agendadaPara = agendamentoPreJuridico(mensagem.payload, new Date(agora))
      const { error } = await supabase
        .from('mensagens')
        .update({
          status: MENSAGEM_STATUS.AGENDADA,
          status_operacional: MENSAGEM_STATUS.AGENDADA,
          scheduled_at: agendadaPara,
          agendada_para: agendadaPara,
          aprovado_por: user.id,
          aprovado_em: agora,
          erro: null,
          erro_envio: null,
        } as any)
        .eq('id', mensagem.id)
      if (error) throw new Error(`Erro ao agendar mensagem do Flow: ${error.message}`)
    }

    await supabase
      .from('lote_itens')
      .update({ status: LOTE_ITEM_STATUS.APROVADO, aprovado_em: agora, operador_id: user.id } as any)
      .eq('pre_juridico_flow_id', flowId)
      .in('status', [LOTE_ITEM_STATUS.CRIADO, LOTE_ITEM_STATUS.ERRO])
    await supabase
      .from('lotes')
      .update({ status: LOTE_STATUS.APROVADO, aprovado_por: user.id, aprovado_em: agora } as any)
      .eq('id', flow.lote_id)
    await supabase
      .from('pre_juridico_flows')
      .update({ status: 'em_execucao', iniciado_em: agora, atualizado_por: user.id } as any)
      .eq('id', flowId)
    await recalcularFlowPreJuridico(supabase, flowId)
  }

  await registrarLogMensageria(supabase as any, {
    carteira_id: flow.carteira_id,
    lote_id: flow.lote_id,
    evento: flow.status === 'pausado' ? 'pre_juridico_flow_retomado' : 'pre_juridico_flow_enviado',
    status_anterior: flow.status,
    status_novo: 'em_execucao',
    descricao: 'Flow pré-jurídico liberado para o monitor de disparos.',
    payload: { flow_id: flowId },
  })

  revalidatePath('/app/pre-juridico/flow')
}

export async function pausarFlowPreJuridico(flowId: string) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const supabase = createAdminClient()
  const flow = await getFlow(supabase, flowId, scope)
  if (flow.status !== 'em_execucao') throw new Error('Somente Flows em execução podem ser pausados.')
  const { error } = await supabase
    .from('pre_juridico_flows')
    .update({ status: 'pausado', pausado_em: new Date().toISOString(), atualizado_por: user.id } as any)
    .eq('id', flowId)
  if (error) throw new Error(`Erro ao pausar Flow: ${error.message}`)
  revalidatePath('/app/pre-juridico/flow')
}

export async function cancelarFlowPreJuridico(flowId: string) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const supabase = createAdminClient()
  const flow = await getFlow(supabase, flowId, scope)
  if (['cancelado', 'concluido', 'concluido_com_falhas'].includes(flow.status)) throw new Error('Este Flow já está encerrado.')
  const agora = new Date().toISOString()

  await supabase
    .from('mensagens')
    .update({ status: MENSAGEM_STATUS.CANCELADA, status_operacional: MENSAGEM_STATUS.CANCELADA, cancelado_por: user.id, cancelado_em: agora } as any)
    .eq('pre_juridico_flow_id', flowId)
    .in('status', [MENSAGEM_STATUS.PENDENTE_APROVACAO, MENSAGEM_STATUS.APROVADA, MENSAGEM_STATUS.AGENDADA, MENSAGEM_STATUS.FALHA])
  await supabase
    .from('lote_itens')
    .update({ status: LOTE_ITEM_STATUS.CANCELADO, cancelado_em: agora, operador_id: user.id } as any)
    .eq('pre_juridico_flow_id', flowId)
    .in('status', [LOTE_ITEM_STATUS.CRIADO, LOTE_ITEM_STATUS.APROVADO, LOTE_ITEM_STATUS.ERRO])
  await supabase
    .from('lotes')
    .update({ status: LOTE_STATUS.CANCELADO, cancelado_por: user.id, cancelado_em: agora } as any)
    .eq('id', flow.lote_id)
  const { error } = await supabase
    .from('pre_juridico_flows')
    .update({ status: 'cancelado', cancelado_em: agora, atualizado_por: user.id, proximo_disparo_em: null } as any)
    .eq('id', flowId)
  if (error) throw new Error(`Erro ao cancelar Flow: ${error.message}`)

  revalidatePath('/app/pre-juridico/flow')
  revalidatePath('/app/pre-juridico/lotes')
}
