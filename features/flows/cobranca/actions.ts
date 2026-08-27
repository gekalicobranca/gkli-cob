'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { processarReguaCobranca } from '@/features/regua/services/processar-regua-cobranca'
import { registrarLogMensageria } from '@/features/mensageria/engine/logs'
import { COBRANCA_STATUS_OPERACIONAL } from '@/lib/constants/cobrancas'
import { LOTE_ITEM_STATUS, LOTE_STATUS, MENSAGEM_STATUS } from '@/lib/core/status'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import { getPermittedCarteiras, type CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { requireRole } from '@/utils/auth/require-role'
import { requireUser } from '@/utils/auth/require-user'
import { createAdminClient } from '@/utils/supabase/admin'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

function n(value: unknown) {
  return Number(value ?? 0) || 0
}

function assertCarteiraPermitida(scope: CarteiraScope, carteiraId: string | null | undefined) {
  if (!carteiraId) throw new Error('Carteira do Flow não identificada.')
  if (scope.carteiraIds !== null && !scope.carteiraIds.includes(carteiraId)) {
    throw new Error('Você não tem acesso à carteira deste Flow.')
  }
}

function agendamentoCobranca(payload: unknown, base = new Date()) {
  const etapa = payload && typeof payload === 'object' ? (payload as any).etapa : null
  const delayDias = Math.max(0, Number(etapa?.delay_dias ?? 0) || 0)
  return new Date(base.getTime() + delayDias * 86_400_000).toISOString()
}

function flowNome(carteiraNome: string | null | undefined, loteId: string) {
  const carteira = String(carteiraNome ?? 'Carteira').trim() || 'Carteira'
  return `Flow cobrança · ${carteira} · lote ${loteId.slice(0, 8)}`
}

async function getFlow(supabase: SupabaseAdmin, flowId: string, scope: CarteiraScope) {
  let query = supabase
    .from('cobranca_flows')
    .select('id,carteira_id,lote_id,regua_id,status,nome,total_mensagens')
    .eq('id', flowId)
    .maybeSingle()
  query = applyCarteiraScope(query, scope.carteiraIds)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar Flow cobrança: ${error.message}`)
  if (!data) throw new Error('Flow cobrança não encontrado.')
  assertCarteiraPermitida(scope, (data as any).carteira_id)
  return data as any
}

export async function recalcularFlowCobranca(supabase: SupabaseAdmin, flowId: string) {
  const { data: flow } = await supabase
    .from('cobranca_flows')
    .select('id,status')
    .eq('id', flowId)
    .maybeSingle()
  if (!flow || ['cancelado', 'pausado'].includes(String((flow as any).status))) return

  const { data, error } = await supabase
    .from('mensagens')
    .select('status,agendada_para,scheduled_at')
    .eq('cobranca_flow_id', flowId)
  if (error) throw new Error(`Erro ao recalcular Flow cobrança: ${error.message}`)

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
    .from('cobranca_flows')
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
  if (updateError) throw new Error(`Erro ao atualizar Flow cobrança: ${updateError.message}`)
}

export async function criarFlowsCobranca(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const supabase = createAdminClient()
  const cobrancaIds = Array.from(new Set(formData.getAll('cobranca_id').map(String).map((id) => id.trim()).filter(Boolean)))
  if (!cobrancaIds.length) throw new Error('Selecione ao menos uma cobrança ativa.')

  let query = supabase
    .from('cobrancas')
    .select('id,carteira_id,status,status_operacional,carteira:carteiras(nome)')
    .in('id', cobrancaIds)
  query = applyCarteiraScope(query, scope.carteiraIds)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar cobranças para Flow: ${error.message}`)
  const cobrancas = (data ?? []) as any[]
  if (cobrancas.length !== cobrancaIds.length || cobrancas.some((row) => row.status_operacional !== COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA && row.status !== COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA)) {
    throw new Error('Uma ou mais cobranças não estão em Cobrança ativa.')
  }

  const { data: vinculadas, error: vinculadasError } = await supabase
    .from('lote_itens')
    .select('cobranca_id')
    .in('cobranca_id', cobrancaIds)
    .not('cobranca_flow_id', 'is', null)
  if (vinculadasError) throw new Error(`Erro ao verificar vínculos existentes: ${vinculadasError.message}`)
  if ((vinculadas ?? []).length) throw new Error('Uma ou mais cobranças já estão vinculadas a outro Flow.')

  const grupos = new Map<string, any[]>()
  for (const cobranca of cobrancas) {
    const carteiraId = String(cobranca.carteira_id ?? '')
    assertCarteiraPermitida(scope, carteiraId)
    const reguaId = String(formData.get(`regua_id:${carteiraId}`) ?? '').trim()
    if (!reguaId) throw new Error('Selecione a régua de cada lote antes de criar o Flow.')
    const key = `${carteiraId}|${reguaId}`
    const list = grupos.get(key) ?? []
    list.push(cobranca)
    grupos.set(key, list)
  }

  const flowIds: string[] = []
  for (const [key, rows] of grupos.entries()) {
    const [carteiraId, reguaId] = key.split('|')
    const resultado = await processarReguaCobranca({
      scope,
      origem: 'manual',
      cobrancaIds: rows.map((row) => row.id),
      reguaId,
      cooldownDias: 0,
    })

    for (const loteId of resultado.loteIds) {
      const { data: lote } = await supabase
        .from('lotes')
        .select('id,total_avaliadas,total_criadas,total_pendentes,total_erros')
        .eq('id', loteId)
        .maybeSingle()
      const { data: mensagens, error: mensagensError } = await supabase
        .from('mensagens')
        .select('id,status')
        .eq('lote_id', loteId)
      if (mensagensError) throw new Error(`Erro ao contar mensagens do Flow: ${mensagensError.message}`)

      const totalMensagens = (mensagens ?? []).length
      const totalFalhas = n(lote?.total_erros)
      const statusInicial = totalMensagens > 0 ? 'pronto' : totalFalhas > 0 ? 'concluido_com_falhas' : 'concluido'
      const carteira = Array.isArray(rows[0]?.carteira) ? rows[0]?.carteira[0] : rows[0]?.carteira

      const { data: flow, error: flowError } = await supabase
        .from('cobranca_flows')
        .insert({
          carteira_id: carteiraId,
          lote_id: loteId,
          regua_id: reguaId,
          nome: flowNome(carteira?.nome, loteId),
          status: statusInicial,
          total_mensagens: totalMensagens,
          total_pendentes: totalMensagens,
          total_falhas: totalFalhas,
          criado_por: user.id,
          atualizado_por: user.id,
          payload: {
            contexto: 'flow_cobranca',
            cobranca_ids: rows.map((row) => row.id),
            lote_id: loteId,
            regua_id: reguaId,
          },
        } as any)
        .select('id')
        .single()
      if (flowError || !flow?.id) throw new Error(`Erro ao criar Flow cobrança: ${flowError?.message ?? 'Flow não retornado'}`)

      flowIds.push(flow.id)
      await supabase.from('mensagens').update({ cobranca_flow_id: flow.id } as any).eq('lote_id', loteId)
      await supabase.from('lote_itens').update({ cobranca_flow_id: flow.id } as any).eq('lote_id', loteId)
    }
  }

  revalidatePath('/app/flows/cobranca')
  redirect(`/app/flows/cobranca?step=flows&criados=${flowIds.length}`)
}

export async function ativarCobrancasFiltradasFlowCobranca(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const scope = await getPermittedCarteiras()
  const supabase = createAdminClient()
  const cobrancaIds = Array.from(new Set(formData.getAll('cobranca_id').map(String).map((id) => id.trim()).filter(Boolean)))
  if (!cobrancaIds.length) throw new Error('Nenhuma cobrança filtrada para ativar.')

  let query = supabase
    .from('cobrancas')
    .select('id,carteira_id,status,status_operacional')
    .in('id', cobrancaIds)
  query = applyCarteiraScope(query, scope.carteiraIds)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar cobranças filtradas: ${error.message}`)

  const rows = (data ?? []) as any[]
  const rowsIds = rows.map((row) => row.id).filter(Boolean)
  if (!rowsIds.length) throw new Error('Nenhuma cobrança permitida encontrada no filtro atual.')

  const { data: vinculadas, error: vinculadasError } = await supabase
    .from('lote_itens')
    .select('cobranca_id')
    .in('cobranca_id', rowsIds)
    .not('cobranca_flow_id', 'is', null)
  if (vinculadasError) throw new Error(`Erro ao verificar Flows existentes: ${vinculadasError.message}`)
  const vinculadasIds = new Set((vinculadas ?? []).map((row: any) => String(row.cobranca_id)).filter(Boolean))

  const elegiveis = rows
    .filter((row) => !vinculadasIds.has(String(row.id)))
    .filter((row) => row.status_operacional === COBRANCA_STATUS_OPERACIONAL.NOVO || row.status === COBRANCA_STATUS_OPERACIONAL.NOVO)
    .map((row) => row.id)

  if (!elegiveis.length) throw new Error('Nenhuma cobrança filtrada continua elegível para virar Cobrança ativa.')

  const { error: updateError } = await supabase
    .from('cobrancas')
    .update({
      status: COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA,
      status_operacional: COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA,
    } as any)
    .in('id', elegiveis)
  if (updateError) throw new Error(`Erro ao ativar cobranças filtradas: ${updateError.message}`)

  const returnQuery = String(formData.get('return_query') ?? '').trim()
  const nextParams = new URLSearchParams(returnQuery)
  nextParams.set('step', 'lotes')
  nextParams.set('ativadas', String(elegiveis.length))
  nextParams.set('selecionadas', elegiveis.join(','))
  revalidatePath('/app/flows/cobranca')
  redirect(`/app/flows/cobranca?${nextParams.toString()}`)
}

export async function enviarFlowCobranca(flowId: string) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const supabase = createAdminClient()
  const flow = await getFlow(supabase, flowId, scope)
  const agora = new Date().toISOString()

  if (!['pronto', 'pausado'].includes(flow.status)) throw new Error('Este Flow não está pronto para envio.')

  const { data: mensagens, error: mensagensError } = await supabase
    .from('mensagens')
    .select('id,payload')
    .eq('cobranca_flow_id', flowId)
    .in('status', [MENSAGEM_STATUS.PENDENTE_APROVACAO, MENSAGEM_STATUS.APROVADA, MENSAGEM_STATUS.FALHA])
  if (mensagensError) throw new Error(`Erro ao carregar mensagens do Flow: ${mensagensError.message}`)
  if (!(mensagens ?? []).length) throw new Error('Este Flow não possui mensagens pendentes para enviar.')

  for (const mensagem of (mensagens ?? []) as any[]) {
    const agendadaPara = agendamentoCobranca(mensagem.payload, new Date(agora))
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
    .eq('cobranca_flow_id', flowId)
    .in('status', [LOTE_ITEM_STATUS.CRIADO, LOTE_ITEM_STATUS.ERRO])
  await supabase
    .from('lotes')
    .update({ status: LOTE_STATUS.APROVADO, aprovado_por: user.id, aprovado_em: agora } as any)
    .eq('id', flow.lote_id)
  await supabase
    .from('cobranca_flows')
    .update({ status: 'em_execucao', iniciado_em: agora, pausado_em: null, atualizado_por: user.id } as any)
    .eq('id', flowId)

  const { data: itens } = await supabase.from('lote_itens').select('cobranca_id').eq('cobranca_flow_id', flowId)
  const cobrancaIds = Array.from(new Set((itens ?? []).map((item: any) => item.cobranca_id).filter(Boolean)))
  if (cobrancaIds.length) {
    await supabase
      .from('cobrancas')
      .update({ status_operacional: COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA } as any)
      .in('id', cobrancaIds)
  }

  await recalcularFlowCobranca(supabase, flowId)
  await registrarLogMensageria(supabase as any, {
    carteira_id: flow.carteira_id,
    lote_id: flow.lote_id,
    evento: flow.status === 'pausado' ? 'flow_cobranca_retomado' : 'flow_cobranca_enviado',
    status_anterior: flow.status,
    status_novo: 'em_execucao',
    descricao: 'Flow cobrança liberado para agenda de disparos.',
    payload: { flow_id: flowId },
  })

  revalidatePath('/app/flows/cobranca')
}

export async function pausarFlowCobranca(flowId: string) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const supabase = createAdminClient()
  const flow = await getFlow(supabase, flowId, scope)
  if (flow.status !== 'em_execucao') throw new Error('Somente Flows em execução podem ser pausados.')
  const agora = new Date().toISOString()

  await supabase
    .from('mensagens')
    .update({ status: MENSAGEM_STATUS.APROVADA, status_operacional: MENSAGEM_STATUS.APROVADA } as any)
    .eq('cobranca_flow_id', flowId)
    .eq('status', MENSAGEM_STATUS.AGENDADA)
  const { error } = await supabase
    .from('cobranca_flows')
    .update({ status: 'pausado', pausado_em: agora, proximo_disparo_em: null, atualizado_por: user.id } as any)
    .eq('id', flowId)
  if (error) throw new Error(`Erro ao pausar Flow: ${error.message}`)
  revalidatePath('/app/flows/cobranca')
}

export async function cancelarFlowCobranca(flowId: string) {
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
    .eq('cobranca_flow_id', flowId)
    .in('status', [MENSAGEM_STATUS.PENDENTE_APROVACAO, MENSAGEM_STATUS.APROVADA, MENSAGEM_STATUS.AGENDADA, MENSAGEM_STATUS.FALHA])
  await supabase
    .from('lote_itens')
    .update({ status: LOTE_ITEM_STATUS.CANCELADO, cancelado_em: agora, operador_id: user.id } as any)
    .eq('cobranca_flow_id', flowId)
    .in('status', [LOTE_ITEM_STATUS.CRIADO, LOTE_ITEM_STATUS.APROVADO, LOTE_ITEM_STATUS.ERRO])
  await supabase
    .from('lotes')
    .update({ status: LOTE_STATUS.CANCELADO, cancelado_por: user.id, cancelado_em: agora } as any)
    .eq('id', flow.lote_id)
  const { error } = await supabase
    .from('cobranca_flows')
    .update({ status: 'cancelado', cancelado_em: agora, atualizado_por: user.id, proximo_disparo_em: null } as any)
    .eq('id', flowId)
  if (error) throw new Error(`Erro ao cancelar Flow: ${error.message}`)

  revalidatePath('/app/flows/cobranca')
}

export async function reenviarItemFlowCobranca(itemId: string) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const supabase = createAdminClient()

  const { data: item, error: itemError } = await supabase
    .from('lote_itens')
    .select('id,lote_id,mensagem_id,cobranca_flow_id,status')
    .eq('id', itemId)
    .maybeSingle()
  if (itemError) throw new Error(`Erro ao carregar item do Flow: ${itemError.message}`)
  if (!item) throw new Error('Item do Flow não encontrado.')

  const flowId = String((item as any).cobranca_flow_id ?? '')
  const mensagemId = String((item as any).mensagem_id ?? '')
  if (!flowId || !mensagemId) throw new Error('Este item não possui Flow ou mensagem vinculada.')

  const flow = await getFlow(supabase, flowId, scope)
  if (flow.status === 'cancelado') throw new Error('Não é possível reenviar item de Flow cancelado.')

  const { data: mensagem, error: mensagemError } = await supabase
    .from('mensagens')
    .select('id,status,status_operacional,payload')
    .eq('id', mensagemId)
    .maybeSingle()
  if (mensagemError) throw new Error(`Erro ao carregar mensagem do Flow: ${mensagemError.message}`)
  if (!mensagem) throw new Error('Mensagem do item não encontrada.')
  const statusMensagem = String((mensagem as any).status_operacional ?? (mensagem as any).status ?? '')
  if (statusMensagem !== MENSAGEM_STATUS.FALHA) throw new Error('Somente mensagens com falha podem ser reenviadas.')

  const agora = new Date().toISOString()
  const agendadaPara = agendamentoCobranca((mensagem as any).payload, new Date(agora))
  await supabase
    .from('mensagens')
    .update({
      status: MENSAGEM_STATUS.AGENDADA,
      status_operacional: MENSAGEM_STATUS.AGENDADA,
      scheduled_at: agendadaPara,
      agendada_para: agendadaPara,
      aprovado_por: user.id,
      aprovado_em: agora,
      proxima_tentativa_em: null,
      erro: null,
      erro_envio: null,
    } as any)
    .eq('id', mensagemId)
  await supabase
    .from('lote_itens')
    .update({ status: LOTE_ITEM_STATUS.APROVADO, erro: null, operador_id: user.id } as any)
    .eq('id', itemId)
  await supabase
    .from('cobranca_flows')
    .update({ status: 'em_execucao', concluido_em: null, proximo_disparo_em: agendadaPara, atualizado_por: user.id } as any)
    .eq('id', flowId)

  await recalcularFlowCobranca(supabase, flowId)
  revalidatePath('/app/flows/cobranca')
}
