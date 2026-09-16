'use server'

import { consolidarEmailsLote } from './consolidar-emails'
import { getEmailRemetenteKey } from '@/features/mensageria/email-provider'
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
import { hasResponsavelVinculado, unicoCondominio } from './eligibilidade'
import { dividirCriacaoFlows, LIMITE_COBRANCAS_CHAMADA, LIMITE_EMAILS_FLOW } from './dividir-criacao'

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

function flowNome(carteiraNome: string | null | undefined, loteId: string, condominioNome: string) {
  const carteira = String(carteiraNome ?? 'Carteira').trim() || 'Carteira'
  return `Flow cobrança · ${carteira} · ${condominioNome} · lote ${loteId.slice(0, 8)}`
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

export async function criarFlowsCobranca(_state: { error: string } | null, formData: FormData): Promise<{ error?: string; flowIds?: string[] }> {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const supabase = createAdminClient()
  const cobrancaIds = Array.from(new Set(formData.getAll('cobranca_id').map(String).map((id) => id.trim()).filter(Boolean)))
  if (!cobrancaIds.length) return { error: 'Selecione ao menos uma cobrança ativa.' }
  if (cobrancaIds.length > LIMITE_COBRANCAS_CHAMADA) return { error: 'A criação deve ser feita em partes menores. Atualize a página para usar a divisão automática.' }

  let query = supabase
    .from('cobrancas')
    .select('id,carteira_id,condominio_id,unidade_id,status,status_operacional,carteira:carteiras(nome),condominio:condominios(nome,nome_operacional),unidade:unidades(responsavel_nome)')
    .in('id', cobrancaIds)
  query = applyCarteiraScope(query, scope.carteiraIds)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar cobranças para Flow: ${error.message}`)
  const cobrancas = (data ?? []) as any[]
  if (dividirCriacaoFlows(cobrancas).length > 1) return { error: 'Envie uma parte por vez. Atualize a página para usar a divisão automática.' }
  if (!unicoCondominio(cobrancas)) return { error: 'Selecione apenas um condomínio por Flow.' }
  if (cobrancas.length !== cobrancaIds.length || cobrancas.some((row) => row.status_operacional !== COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA && row.status !== COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA)) {
    return { error: 'Uma ou mais cobranças não estão em Cobrança ativa. Atualize a página e revise a seleção.' }
  }
  if (cobrancas.some((row) => !hasResponsavelVinculado(row))) {
    return { error: 'Uma ou mais cobranças não possuem responsável vinculado. Corrija o cadastro ou retire essas cobranças da seleção antes de criar o Flow.' }
  }

  const { data: vinculadas, error: vinculadasError } = await supabase
    .from('lote_itens')
    .select('cobranca_id')
    .in('cobranca_id', cobrancaIds)
    .not('cobranca_flow_id', 'is', null)
  if (vinculadasError) throw new Error(`Erro ao verificar vínculos existentes: ${vinculadasError.message}`)
  if ((vinculadas ?? []).length) return { error: 'Uma ou mais cobranças já estão vinculadas a outro Flow. Atualize a página e revise a seleção.' }

  const { data: pendentesSemFlow, error: pendentesError } = await supabase.from('mensagens')
    .select('id').in('cobranca_id', cobrancaIds).is('cobranca_flow_id', null)
    .in('status', ['pendente_aprovacao', 'aprovada', 'agendada']).limit(1)
  if (pendentesError) throw new Error('Não foi possível conferir mensagens de tentativas anteriores.')
  if (pendentesSemFlow?.length) return { error: 'Há mensagens pendentes de uma criação anterior sem Flow. Revise o lote interrompido antes de tentar novamente; nenhuma mensagem foi duplicada.' }

  const grupos = new Map<string, any[]>()
  for (const cobranca of cobrancas) {
    const carteiraId = String(cobranca.carteira_id ?? '')
    assertCarteiraPermitida(scope, carteiraId)
    const reguaId = String(formData.get(`regua_id:${carteiraId}`) ?? '').trim()
    if (!reguaId) return { error: 'Selecione a régua de cada lote antes de criar o Flow.' }
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
      await consolidarEmailsLote(loteId)
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
      if (totalMensagens > LIMITE_EMAILS_FLOW) throw new Error('Esta unidade gerou mais de 20 mensagens distintas. O lote foi preservado para revisão, sem ativar envios.')
      const totalFalhas = n(lote?.total_erros)
      const statusInicial = totalMensagens > 0 ? 'pronto' : totalFalhas > 0 ? 'concluido_com_falhas' : 'concluido'
      const carteira = Array.isArray(rows[0]?.carteira) ? rows[0]?.carteira[0] : rows[0]?.carteira
      const condominio = Array.isArray(rows[0]?.condominio) ? rows[0]?.condominio[0] : rows[0]?.condominio

      const { data: flow, error: flowError } = await supabase
        .from('cobranca_flows')
        .insert({
          carteira_id: carteiraId,
          lote_id: loteId,
          regua_id: reguaId,
          nome: flowNome(carteira?.nome, loteId, condominio?.nome_operacional || condominio?.nome || 'Condomínio'),
          status: statusInicial,
          total_mensagens: totalMensagens,
          total_pendentes: totalMensagens,
          total_falhas: totalFalhas,
          criado_por: user.id,
          atualizado_por: user.id,
          payload: {
            contexto: 'flow_cobranca',
            cobranca_ids: rows.map((row) => row.id),
            condominio_id: rows[0].condominio_id,
            lote_id: loteId,
            regua_id: reguaId,
          },
        } as any)
        .select('id')
        .single()
      if (flowError || !flow?.id) throw new Error(`Erro ao criar Flow cobrança: ${flowError?.message ?? 'Flow não retornado'}`)

      flowIds.push(flow.id)
      const { error: mensagensVinculoError } = await supabase.from('mensagens').update({ cobranca_flow_id: flow.id } as any).eq('lote_id', loteId)
      if (mensagensVinculoError) throw new Error('Flow criado, mas o vínculo das mensagens precisa ser revisado antes de continuar.')
      const { error: itensVinculoError } = await supabase.from('lote_itens').update({ cobranca_flow_id: flow.id } as any).eq('lote_id', loteId)
      if (itensVinculoError) throw new Error('Flow criado, mas o vínculo das cobranças precisa ser revisado antes de continuar.')
    }
  }

  revalidatePath('/app/flows/cobranca')
  return { flowIds }
}

export async function ativarCobrancasFiltradasFlowCobranca(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const scope = await getPermittedCarteiras()
  const supabase = createAdminClient()
  const cobrancaIds = Array.from(new Set(formData.getAll('cobranca_id').map(String).map((id) => id.trim()).filter(Boolean)))
  if (!cobrancaIds.length) throw new Error('Nenhuma cobrança filtrada para ativar.')

  let query = supabase
    .from('cobrancas')
    .select('id,carteira_id,condominio_id,status,status_operacional,unidade:unidades(responsavel_nome)')
    .in('id', cobrancaIds)
  query = applyCarteiraScope(query, scope.carteiraIds)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar cobranças filtradas: ${error.message}`)

  const rows = (data ?? []) as any[]
  if (!unicoCondominio(rows)) throw new Error('Selecione apenas um condomínio para ativar as cobranças.')
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
    .filter(hasResponsavelVinculado)
    .map((row) => row.id)

  if (!elegiveis.length) throw new Error('Nenhuma cobrança filtrada continua elegível para virar Cobrança ativa. Verifique se há responsável vinculado nas unidades selecionadas.')

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
  if (!['pronto', 'pausado'].includes(flow.status)) throw new Error('Este Flow não está pronto para ativação.')
  const { data: canais, error: canaisError } = await supabase.from('mensagens').select('canal').eq('cobranca_flow_id', flowId)
  if (canaisError) throw new Error(canaisError.message)
  const remetente = canais?.some(m => m.canal === 'email') ? await getEmailRemetenteKey(flow.carteira_id) : ''
  const { error } = await supabase.rpc('email_ativar_flow', { p_flow: flowId, p_remetente: remetente, p_usuario: user.id })
  if (error) throw new Error(`Erro ao ativar Flow: ${error.message}`)

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
    evento: flow.status === 'pausado' ? 'flow_cobranca_retomado' : 'flow_cobranca_ativado',
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

export async function desfazerAtivacaoCobrancasFlowCobranca(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const scope = await getPermittedCarteiras()
  const supabase = createAdminClient()
  const cobrancaIds = Array.from(new Set(formData.getAll('cobranca_id').map(String).map((id) => id.trim()).filter(Boolean)))
  if (!cobrancaIds.length) throw new Error('Selecione ao menos uma cobrança ativa.')

  const idChunks = Array.from({ length: Math.ceil(cobrancaIds.length / 100) }, (_, index) => cobrancaIds.slice(index * 100, (index + 1) * 100))
  const cobrancas: any[] = []
  for (const ids of idChunks) {
    let query = supabase
      .from('cobrancas')
      .select('id,carteira_id,status,status_operacional')
      .in('id', ids)
    query = applyCarteiraScope(query, scope.carteiraIds)
    const { data, error } = await query
    if (error) throw new Error(`Erro ao validar cobranças ativas: ${error.message}`)
    cobrancas.push(...(data ?? []))
  }
  if (cobrancas.length !== cobrancaIds.length) throw new Error('Uma ou mais cobranças não estão disponíveis para alteração.')
  if (cobrancas.some((row: any) => row.status_operacional !== COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA && row.status !== COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA)) {
    throw new Error('Somente cobranças ativas e ainda sem Flow podem voltar para novas.')
  }

  for (const ids of idChunks) {
    const { data: vinculadas, error: vinculadasError } = await supabase
      .from('lote_itens')
      .select('cobranca_id')
      .in('cobranca_id', ids)
      .not('cobranca_flow_id', 'is', null)
      .limit(1)
    if (vinculadasError) throw new Error(`Erro ao verificar vínculos com Flows: ${vinculadasError.message}`)
    if ((vinculadas ?? []).length) throw new Error('Uma ou mais cobranças já pertencem a um Flow e não podem ser removidas por esta ação.')
  }

  for (const ids of idChunks) {
    const { error: updateError } = await supabase
      .from('cobrancas')
      .update({
        status: COBRANCA_STATUS_OPERACIONAL.NOVO,
        status_operacional: COBRANCA_STATUS_OPERACIONAL.NOVO,
      } as any)
      .in('id', ids)
    if (updateError) throw new Error(`Erro ao desfazer ativação das cobranças: ${updateError.message}`)
  }

  revalidatePath('/app/flows/cobranca')
}

export async function excluirFlowCobranca(flowId: string) {
  await requireRole(['admin', 'gestor'])
  const scope = await getPermittedCarteiras()
  const supabase = createAdminClient()
  const flow = await getFlow(supabase, flowId, scope)
  if (flow.status === 'em_execucao') throw new Error('Pause ou cancele o Flow antes de excluí-lo.')

  const { data: mensagens, error: mensagensError } = await supabase
    .from('mensagens')
    .select('id,status,sent_at,enviada_em,provider_message_id')
    .eq('cobranca_flow_id', flowId)
  if (mensagensError) throw new Error(`Erro ao validar mensagens do Flow: ${mensagensError.message}`)
  const possuiEnvio = (mensagens ?? []).some((mensagem: any) =>
    mensagem.status === MENSAGEM_STATUS.ENVIADA || mensagem.sent_at || mensagem.enviada_em || mensagem.provider_message_id,
  )
  if (possuiEnvio) throw new Error('Este Flow possui histórico de envio e não pode ser excluído. Cancele-o para preservar a auditoria.')

  const { error: deleteMensagensError } = await supabase.from('mensagens').delete().eq('cobranca_flow_id', flowId)
  if (deleteMensagensError) throw new Error(`Erro ao excluir mensagens do Flow: ${deleteMensagensError.message}`)
  const { error: deleteItensError } = await supabase.from('lote_itens').delete().eq('lote_id', flow.lote_id)
  if (deleteItensError) throw new Error(`Erro ao excluir itens do lote: ${deleteItensError.message}`)
  const { error: deleteFlowError } = await supabase.from('cobranca_flows').delete().eq('id', flowId)
  if (deleteFlowError) throw new Error(`Erro ao excluir Flow: ${deleteFlowError.message}`)
  const { error: deleteLoteError } = await supabase.from('lotes').delete().eq('id', flow.lote_id)
  if (deleteLoteError) throw new Error(`Erro ao excluir lote: ${deleteLoteError.message}`)

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
    .select('id,canal,status,status_operacional,payload')
    .eq('id', mensagemId)
    .maybeSingle()
  if (mensagemError) throw new Error(`Erro ao carregar mensagem do Flow: ${mensagemError.message}`)
  if (!mensagem) throw new Error('Mensagem do item não encontrada.')
  const statusMensagem = String((mensagem as any).status_operacional ?? (mensagem as any).status ?? '')
  if (statusMensagem !== MENSAGEM_STATUS.FALHA) throw new Error('Somente mensagens com falha podem ser reenviadas.')

  const agora = new Date().toISOString()
  let agendadaPara = agora
  if (mensagem.canal === 'email') {
    const remetente = await getEmailRemetenteKey(flow.carteira_id)
    const { data, error } = await supabase.rpc('email_reservar_horario', { p_mensagem: mensagemId, p_remetente: remetente })
    if (error) throw new Error(error.message)
    agendadaPara = data
  }
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
    .eq('mensagem_id', mensagemId)
  await supabase
    .from('cobranca_flows')
    .update({ status: 'em_execucao', concluido_em: null, proximo_disparo_em: agendadaPara, atualizado_por: user.id } as any)
    .eq('id', flowId)

  await recalcularFlowCobranca(supabase, flowId)
  revalidatePath('/app/flows/cobranca')
}
