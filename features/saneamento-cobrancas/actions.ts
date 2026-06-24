'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { requireRole } from '@/utils/auth/require-role'
import { requireUser } from '@/utils/auth/require-user'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { registrarEventoOperacional } from '@/features/operacional/service'

function onlyDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

function assertCarteiraPermitida(carteiraIds: string[] | null, carteiraId: string | null | undefined) {
  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (carteiraIds !== null && !carteiraIds.includes(carteiraId)) {
    throw new Error('Você não tem permissão para operar esta carteira.')
  }
}

async function getSaneamentoPermitido(id: string) {
  const supabase = await createClient()
  const scope = await getPermittedCarteiras()

  const { data, error } = await supabase
    .from('saneamento_cobrancas')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Erro ao carregar pendência: ${error.message}`)
  if (!data) throw new Error('Pendência de saneamento não encontrada.')

  const carteiraId = String((data as any).carteira_id ?? '')
  if (scope.carteiraIds !== null && !scope.carteiraIds.includes(carteiraId)) {
    throw new Error('Você não tem permissão para operar esta carteira.')
  }

  return { supabase, saneamento: data as any }
}

export async function alterarUnidadeCobrancaPeloSaneamento(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const supabase = await createClient()
  const scope = await getPermittedCarteiras()

  const cobrancaId = String(formData.get('cobranca_id') ?? '').trim()
  const unidadeDestinoId = String(formData.get('unidade_destino_id') ?? '').trim()
  const observacao = String(formData.get('observacao') ?? '').trim()

  if (!cobrancaId) throw new Error('Cobrança obrigatória para correção.')
  if (!unidadeDestinoId) throw new Error('Unidade destino obrigatória.')

  const { data: cobranca, error: cobrancaError } = await supabase
    .from('cobrancas')
    .select('id, carteira_id, condominio_id, unidade_id, competencia, vencimento, status, status_operacional, unidades:unidade_id(identificacao, bloco, responsavel_nome)')
    .eq('id', cobrancaId)
    .maybeSingle()

  if (cobrancaError) throw new Error(`Erro ao carregar cobrança: ${cobrancaError.message}`)
  if (!cobranca) throw new Error('Cobrança não encontrada.')

  assertCarteiraPermitida(scope.carteiraIds, (cobranca as any).carteira_id)

  const { data: unidadeDestino, error: unidadeError } = await supabase
    .from('unidades')
    .select('id, carteira_id, condominio_id, identificacao, bloco, responsavel_nome, email, telefone')
    .eq('id', unidadeDestinoId)
    .maybeSingle()

  if (unidadeError) throw new Error(`Erro ao carregar unidade destino: ${unidadeError.message}`)
  if (!unidadeDestino) throw new Error('Unidade destino não encontrada.')

  assertCarteiraPermitida(scope.carteiraIds, (unidadeDestino as any).carteira_id)

  if ((unidadeDestino as any).carteira_id !== (cobranca as any).carteira_id) {
    throw new Error('A unidade destino não pertence à mesma carteira da cobrança.')
  }

  if ((unidadeDestino as any).condominio_id !== (cobranca as any).condominio_id) {
    throw new Error('A unidade destino precisa pertencer ao mesmo condomínio da cobrança.')
  }

  if ((cobranca as any).unidade_id === unidadeDestinoId) {
    throw new Error('A cobrança já está vinculada a esta unidade.')
  }

  const { data: acordosVinculados, error: acordoError } = await supabase
    .from('acordo_cobrancas')
    .select('acordo_id, acordos:acordo_id(id, unidade_id, condominio_id, carteira_id)')
    .eq('cobranca_id', cobrancaId)

  if (acordoError) throw new Error(`Erro ao verificar acordo vinculado: ${acordoError.message}`)

  const acordoIds = [...new Set((acordosVinculados ?? []).map((row: any) => String(row.acordo_id)).filter(Boolean))]

  for (const acordoId of acordoIds) {
    const { data: itensAcordo, error: itensError } = await supabase
      .from('acordo_cobrancas')
      .select('cobranca_id, cobrancas:cobranca_id(unidade_id)')
      .eq('acordo_id', acordoId)

    if (itensError) throw new Error(`Erro ao validar itens do acordo: ${itensError.message}`)

    const possuiOutraUnidade = (itensAcordo ?? []).some((item: any) => {
      const unidadeItem = Array.isArray(item.cobrancas) ? item.cobrancas[0]?.unidade_id : item.cobrancas?.unidade_id
      return unidadeItem && unidadeItem !== (cobranca as any).unidade_id
    })

    if (possuiOutraUnidade) {
      throw new Error('O acordo vinculado possui cobranças de mais de uma unidade. Corrija o acordo manualmente antes de alterar o vínculo.')
    }
  }

  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('cobrancas')
    .update({
      unidade_id: unidadeDestinoId,
      updated_at: now,
    })
    .eq('id', cobrancaId)

  if (updateError) throw new Error(`Erro ao alterar unidade da cobrança: ${updateError.message}`)

  if (acordoIds.length > 0) {
    const { error: acordoUpdateError } = await supabase
      .from('acordos')
      .update({
        unidade_id: unidadeDestinoId,
        updated_at: now,
      })
      .in('id', acordoIds)

    if (acordoUpdateError) throw new Error(`Cobrança corrigida, mas erro ao atualizar acordo vinculado: ${acordoUpdateError.message}`)

    const { error: solicitacaoUpdateError } = await supabase
      .from('solicitacoes_administradora')
      .update({
        unidade_id: unidadeDestinoId,
        updated_at: now,
      })
      .in('acordo_id', acordoIds)

    if (solicitacaoUpdateError) {
      throw new Error(`Cobrança e acordo corrigidos, mas erro ao atualizar solicitação da administradora: ${solicitacaoUpdateError.message}`)
    }
  }

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (cobranca as any).carteira_id ?? null,
    entidadeTipo: 'cobranca',
    entidadeId: cobrancaId,
    eventoCodigo: 'cobranca.unidade_corrigida_saneamento',
    titulo: 'Unidade da cobrança corrigida',
    descricao: observacao || 'Vínculo da cobrança alterado pelo saneamento.',
    severidade: 'info',
    antes: {
      unidade_id: (cobranca as any).unidade_id,
      unidade: (cobranca as any).unidades ?? null,
    },
    depois: {
      unidade_id: unidadeDestinoId,
      unidade: unidadeDestino,
    },
    payload: {
      competencia: (cobranca as any).competencia ?? null,
      vencimento: (cobranca as any).vencimento ?? null,
      origem: 'gestao_saneamento',
      acordo_ids: acordoIds,
    },
    origem: 'manual',
    auditavel: true,
    userId: user?.id ?? null,
  })

  revalidatePath('/app/gestao/saneamento-cobrancas')
  revalidatePath(`/app/cobrancas/${cobrancaId}`)
  revalidatePath('/app/cobrancas')
  revalidatePath('/app/unidades')
  revalidatePath('/app/dashboard')
}

async function finalizarSaneamento(params: {
  id: string
  status: 'resolvido' | 'ignorado'
  observacao?: string
}) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const { supabase, saneamento } = await getSaneamentoPermitido(params.id)

  const { error } = await supabase
    .from('saneamento_cobrancas')
    .update({
      status: params.status,
      observacao_resolucao: params.observacao || null,
      resolved_at: new Date().toISOString(),
      resolved_by: user?.id ?? null,
    })
    .eq('id', params.id)

  if (error) throw new Error(`Erro ao finalizar saneamento: ${error.message}`)

  await registrarEventoOperacional(supabase as any, {
    carteiraId: saneamento.carteira_id ?? null,
    entidadeTipo: 'operacional',
    entidadeId: params.id,
    eventoCodigo: `saneamento_cobranca.${params.status}`,
    titulo: params.status === 'resolvido' ? 'Saneamento resolvido' : 'Saneamento ignorado',
    descricao: params.observacao || null,
    severidade: params.status === 'resolvido' ? 'sucesso' : 'info',
    userId: user?.id ?? null,
    payload: {
      tipo: saneamento.tipo,
      unidade_relatorio: saneamento.unidade_relatorio,
      responsavel_relatorio: saneamento.responsavel_relatorio,
      responsavel_cadastro: saneamento.responsavel_cadastro,
    },
  })
}

export async function atualizarResponsavelPeloSaneamento(formData: FormData) {
  const id = String(formData.get('saneamento_id') ?? '')
  if (!id) throw new Error('Pendência obrigatória.')

  await requireRole(['admin', 'gestor', 'operador'])
  const { supabase, saneamento } = await getSaneamentoPermitido(id)

  const unidadeId = String(saneamento.unidade_id ?? '')
  if (!unidadeId) throw new Error('Pendência sem unidade vinculada para atualização.')

  const responsavelNome = String(saneamento.responsavel_relatorio ?? '').trim()
  if (!responsavelNome) throw new Error('Pendência sem responsável do relatório.')

  const patch = {
    responsavel_nome: responsavelNome,
    responsavel_documento: onlyDigits(saneamento.responsavel_documento_relatorio) || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('unidades').update(patch).eq('id', unidadeId)
  if (error) throw new Error(`Erro ao atualizar unidade: ${error.message}`)

  await finalizarSaneamento({ id, status: 'resolvido', observacao: 'Responsável atualizado pelo saneamento.' })

  revalidatePath('/app/gestao/saneamento-cobrancas')
  revalidatePath('/app/unidades')
  revalidatePath('/app/cobrancas')
}

export async function confirmarUnidadeSugerida(formData: FormData) {
  const id = String(formData.get('saneamento_id') ?? '')
  if (!id) throw new Error('Pendência obrigatória.')

  await requireRole(['admin', 'gestor', 'operador'])
  const { supabase, saneamento } = await getSaneamentoPermitido(id)

  const unidadeSugeridaId = String(saneamento.unidade_sugerida_id ?? '')
  if (!unidadeSugeridaId) throw new Error('Pendência sem unidade sugerida.')

  if (saneamento.cobranca_id) {
    const { error } = await supabase
      .from('cobrancas')
      .update({ unidade_id: unidadeSugeridaId, updated_at: new Date().toISOString() })
      .eq('id', saneamento.cobranca_id)

    if (error) throw new Error(`Erro ao vincular cobrança à unidade sugerida: ${error.message}`)
  }

  await finalizarSaneamento({ id, status: 'resolvido', observacao: 'Unidade sugerida confirmada.' })

  revalidatePath('/app/gestao/saneamento-cobrancas')
  revalidatePath('/app/cobrancas')
}

export async function marcarSaneamentoResolvido(formData: FormData) {
  const id = String(formData.get('saneamento_id') ?? '')
  if (!id) throw new Error('Pendência obrigatória.')

  await finalizarSaneamento({ id, status: 'resolvido', observacao: 'Resolvido manualmente.' })

  revalidatePath('/app/gestao/saneamento-cobrancas')
}

export async function ignorarSaneamentoCobranca(formData: FormData) {
  const id = String(formData.get('saneamento_id') ?? '')
  if (!id) throw new Error('Pendência obrigatória.')

  await finalizarSaneamento({ id, status: 'ignorado', observacao: 'Ignorado pela gestão.' })

  revalidatePath('/app/gestao/saneamento-cobrancas')
}

export async function atualizarResponsaveisEmLote(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const ids = [...new Set(formData.getAll('saneamento_ids').map((value) => String(value)).filter(Boolean))]
  if (ids.length === 0) throw new Error('Selecione ao menos uma pendência.')

  let atualizados = 0

  for (const id of ids) {
    const { supabase, saneamento } = await getSaneamentoPermitido(id)
    const tipo = String(saneamento.tipo ?? '')
    const unidadeId = String(saneamento.unidade_id ?? '')
    const responsavelNome = String(saneamento.responsavel_relatorio ?? '').trim()

    if (!['responsavel_divergente', 'responsavel_ausente'].includes(tipo)) continue
    if (!unidadeId || !responsavelNome) continue

    const { error } = await supabase
      .from('unidades')
      .update({
        responsavel_nome: responsavelNome,
        responsavel_documento: onlyDigits(saneamento.responsavel_documento_relatorio) || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', unidadeId)

    if (error) throw new Error(`Erro ao atualizar unidade: ${error.message}`)

    await finalizarSaneamento({ id, status: 'resolvido', observacao: 'Responsável atualizado em lote pelo saneamento.' })
    atualizados += 1
  }

  if (atualizados === 0) {
    throw new Error('Nenhuma pendência selecionada era elegível para atualizar responsável.')
  }

  revalidatePath('/app/gestao/saneamento-cobrancas')
  revalidatePath('/app/unidades')
  revalidatePath('/app/cobrancas')
}

export async function ignorarSaneamentosEmLote(formData: FormData) {
  const ids = [...new Set(formData.getAll('saneamento_ids').map((value) => String(value)).filter(Boolean))]
  if (ids.length === 0) throw new Error('Selecione ao menos uma pendência.')

  for (const id of ids) {
    await finalizarSaneamento({ id, status: 'ignorado', observacao: 'Ignorado em lote pela gestão.' })
  }

  revalidatePath('/app/gestao/saneamento-cobrancas')
}
