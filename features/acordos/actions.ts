'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { requireRole } from '@/utils/auth/require-role'

function toNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? '0')
    .replace(/\./g, '')
    .replace(',', '.')
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date)
  copy.setMonth(copy.getMonth() + months)
  return copy
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export async function createAcordo(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])

  const cobrancaId = String(formData.get('cobranca_id') ?? '')
  const tipo = String(formData.get('tipo') ?? 'extrajudicial')
  const numeroProcesso = String(formData.get('numero_processo') ?? '').trim()
  const valorAcordado = toNumber(formData.get('valor_acordado'))
  const entrada = toNumber(formData.get('entrada'))
  const quantidadeParcelas = Number(formData.get('quantidade_parcelas') ?? 1)
  const primeiroVencimento = String(formData.get('primeiro_vencimento') ?? '')
  const documentoUrl = String(formData.get('documento_url') ?? '').trim()
  const observacoes = String(formData.get('observacoes') ?? '').trim()

  if (!cobrancaId) throw new Error('Cobrança obrigatória.')
  if (!['extrajudicial', 'judicial'].includes(tipo)) throw new Error('Tipo de acordo inválido.')
  if (tipo === 'judicial' && !numeroProcesso) throw new Error('Número do processo obrigatório para acordo judicial.')
  if (valorAcordado <= 0) throw new Error('Valor acordado deve ser maior que zero.')
  if (entrada < 0) throw new Error('Entrada inválida.')
  if (entrada > valorAcordado) throw new Error('Entrada não pode ser maior que o valor acordado.')
  if (!Number.isInteger(quantidadeParcelas) || quantidadeParcelas < 1 || quantidadeParcelas > 60) {
    throw new Error('Quantidade de parcelas deve ficar entre 1 e 60.')
  }
  if (!primeiroVencimento) throw new Error('Primeiro vencimento obrigatório.')

  const supabase = await createClient()

  const { data: cobranca, error: cobrancaError } = await supabase
    .from('cobrancas')
    .select('id, carteira_id, condominio_id, unidade_id, status')
    .eq('id', cobrancaId)
    .maybeSingle()

  if (cobrancaError) {
    throw new Error(`Erro ao carregar cobrança: ${cobrancaError.message}`)
  }

  if (!cobranca) {
    throw new Error('Cobrança não encontrada.')
  }

  if (['acordo firmado', 'acordo efetivado', 'judicializado', 'suspenso'].includes(cobranca.status)) {
    throw new Error('Esta cobrança não está elegível para novo acordo.')
  }

  const { data: acordo, error: acordoError } = await supabase
    .from('acordos')
    .insert({
      carteira_id: cobranca.carteira_id,
      cobranca_id: cobranca.id,
      condominio_id: cobranca.condominio_id,
      unidade_id: cobranca.unidade_id,
      tipo,
      numero_processo: tipo === 'judicial' ? numeroProcesso : null,
      valor_acordado: valorAcordado,
      entrada,
      data_acordo: toISODate(new Date()),
      status: 'ativo',
      documento_url: documentoUrl || null,
      observacoes: observacoes || null,
    })
    .select('id')
    .single()

  if (acordoError) {
    throw new Error(`Erro ao criar acordo: ${acordoError.message}`)
  }

  const saldoParcelado = roundMoney(valorAcordado - entrada)
  const baseParcela = Math.floor((saldoParcelado / quantidadeParcelas) * 100) / 100
  const parcelas = []
  let acumulado = 0

  for (let index = 1; index <= quantidadeParcelas; index++) {
    const isLast = index === quantidadeParcelas
    const valor = isLast
      ? roundMoney(saldoParcelado - acumulado)
      : roundMoney(baseParcela)

    acumulado = roundMoney(acumulado + valor)

    parcelas.push({
      acordo_id: acordo.id,
      numero: index,
      valor,
      vencimento: toISODate(addMonths(new Date(`${primeiroVencimento}T00:00:00`), index - 1)),
      status: 'aberta',
    })
  }

  const { error: parcelasError } = await supabase
    .from('parcelas_acordo')
    .insert(parcelas)

  if (parcelasError) {
    throw new Error(`Acordo criado, mas houve erro ao gerar parcelas: ${parcelasError.message}`)
  }

  const { error: cobrancaUpdateError } = await supabase
    .from('cobrancas')
    .update({ status: 'acordo firmado' })
    .eq('id', cobranca.id)

  if (cobrancaUpdateError) {
    throw new Error(`Acordo criado, mas houve erro ao atualizar cobrança: ${cobrancaUpdateError.message}`)
  }

  revalidatePath('/app/acordos')
  revalidatePath('/app/cobrancas')
  revalidatePath('/app')
  revalidatePath('/app/dashboard')
  redirect(`/app/acordos/${acordo.id}`)
}

export async function marcarParcelaComoPaga(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])

  const parcelaId = String(formData.get('parcela_id') ?? '')
  const acordoId = String(formData.get('acordo_id') ?? '')

  if (!parcelaId || !acordoId) {
    throw new Error('Parcela e acordo são obrigatórios.')
  }

  const supabase = await createClient()

  const { error: parcelaError } = await supabase
    .from('parcelas_acordo')
    .update({
      status: 'paga',
      data_pagamento: toISODate(new Date()),
    })
    .eq('id', parcelaId)

  if (parcelaError) {
    throw new Error(`Erro ao marcar parcela como paga: ${parcelaError.message}`)
  }

  const { data: parcelas, error: parcelasError } = await supabase
    .from('parcelas_acordo')
    .select('status')
    .eq('acordo_id', acordoId)

  if (parcelasError) {
    throw new Error(`Erro ao verificar parcelas: ${parcelasError.message}`)
  }

  const todasPagas = (parcelas ?? []).length > 0 && (parcelas ?? []).every((parcela: { status: string }) => parcela.status === 'paga')

  if (todasPagas) {
    const { data: acordo, error: acordoError } = await supabase
      .from('acordos')
      .select('id, cobranca_id')
      .eq('id', acordoId)
      .maybeSingle()

    if (acordoError) {
      throw new Error(`Erro ao carregar acordo: ${acordoError.message}`)
    }

    const { error: updateAcordoError } = await supabase
      .from('acordos')
      .update({ status: 'quitado' })
      .eq('id', acordoId)

    if (updateAcordoError) {
      throw new Error(`Erro ao quitar acordo: ${updateAcordoError.message}`)
    }

    if (acordo?.cobranca_id) {
      const { error: updateCobrancaError } = await supabase
        .from('cobrancas')
        .update({ status: 'acordo efetivado' })
        .eq('id', acordo.cobranca_id)

      if (updateCobrancaError) {
        throw new Error(`Erro ao efetivar cobrança: ${updateCobrancaError.message}`)
      }
    }
  }

  revalidatePath(`/app/acordos/${acordoId}`)
  revalidatePath('/app/acordos')
  revalidatePath('/app/cobrancas')
  revalidatePath('/app')
  revalidatePath('/app/dashboard')
}

export async function marcarParcelaComoVencida(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])

  const parcelaId = String(formData.get('parcela_id') ?? '')
  const acordoId = String(formData.get('acordo_id') ?? '')

  if (!parcelaId || !acordoId) {
    throw new Error('Parcela e acordo são obrigatórios.')
  }

  const supabase = await createClient()

  const { error: parcelaError } = await supabase
    .from('parcelas_acordo')
    .update({ status: 'vencida' })
    .eq('id', parcelaId)

  if (parcelaError) {
    throw new Error(`Erro ao marcar parcela como vencida: ${parcelaError.message}`)
  }

  const { error: acordoError } = await supabase
    .from('acordos')
    .update({ status: 'em atraso' })
    .eq('id', acordoId)

  if (acordoError) {
    throw new Error(`Erro ao atualizar acordo: ${acordoError.message}`)
  }

  revalidatePath(`/app/acordos/${acordoId}`)
  revalidatePath('/app/acordos')
  revalidatePath('/app')
}
