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
