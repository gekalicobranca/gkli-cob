'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { requireUser } from '@/utils/auth/require-user'

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function toNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? '0').replace('.', '').replace(',', '.')
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeComparable(value: unknown) {
  if (value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isNaN(value)) return null
  return value
}

function buildDiff(before: Record<string, any> | null, after: Record<string, any>) {
  const diff: Record<string, { antes: any; depois: any }> = {}

  for (const key of Object.keys(after)) {
    const previous = normalizeComparable(before?.[key] ?? null)
    const next = normalizeComparable(after[key])

    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      diff[key] = { antes: previous, depois: next }
    }
  }

  return diff
}

async function registrarAuditoria(supabase: Awaited<ReturnType<typeof createClient>>, payload: Record<string, any>) {
  const { error } = await supabase.from('auditoria_eventos').insert(payload)

  if (error && error.code !== '42P01' && !error.message?.includes('auditoria_eventos')) {
    throw new Error(`Falha ao registrar auditoria: ${error.message}`)
  }
}

export async function createCondominio(formData: FormData) {
  const user = await requireUser()

  const carteiraId = String(formData.get('carteira_id') ?? '')
  const nome = String(formData.get('nome') ?? '').trim()
  const cnpj = onlyDigits(String(formData.get('cnpj') ?? ''))
  const administradora = String(formData.get('administradora') ?? '').trim()
  const vencimentoCotaDia = Number(formData.get('vencimento_cota_dia') ?? 10)
  const valorCota = toNumber(formData.get('valor_cota_condominial'))
  const inicioCobrancaDias = Number(formData.get('inicio_cobranca_dias') ?? 30)
  const observacoes = String(formData.get('observacoes') ?? '').trim()
  const reguaCobrancaId = String(formData.get('regua_cobranca_id') ?? '').trim() || null
  const reguaAcordoId = String(formData.get('regua_acordo_id') ?? '').trim() || null

  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (nome.length < 2) throw new Error('Nome do condomínio obrigatório.')

  const supabase = await createClient()
  const payload = {
    carteira_id: carteiraId,
    nome,
    cnpj: cnpj || null,
    administradora: administradora || null,
    vencimento_cota_dia: vencimentoCotaDia,
    valor_cota_condominial: valorCota,
    inicio_cobranca_dias: inicioCobrancaDias,
    regua_cobranca_id: reguaCobrancaId,
    regua_acordo_id: reguaAcordoId,
    status: 'ativo',
    observacoes: observacoes || null,
  }

  const { data, error } = await supabase.from('condominios').insert(payload).select('id, carteira_id, nome').single()

  if (error) throw new Error(`Erro ao criar condomínio: ${error.message}`)

  await registrarAuditoria(supabase, {
    carteira_id: data.carteira_id,
    entidade_tipo: 'condominio',
    entidade_id: data.id,
    evento_tipo: 'criacao',
    titulo: 'Condomínio criado',
    descricao: `Cadastro criado para ${data.nome}.`,
    usuario_id: user.id,
    usuario_nome: user.nome,
    usuario_email: user.email,
    depois: payload,
  })

  revalidatePath('/app/condominios')
  redirect('/app/condominios')
}

export async function updateCondominioIntegral(formData: FormData) {
  const user = await requireUser()

  const id = String(formData.get('id') ?? '')
  const carteiraId = String(formData.get('carteira_id') ?? '')
  const nome = String(formData.get('nome') ?? '').trim()
  const cnpj = onlyDigits(String(formData.get('cnpj') ?? ''))
  const administradora = String(formData.get('administradora') ?? '').trim()
  const vencimentoCotaDia = Number(formData.get('vencimento_cota_dia') ?? 10)
  const valorCota = toNumber(formData.get('valor_cota_condominial'))
  const inicioCobrancaDias = Number(formData.get('inicio_cobranca_dias') ?? 30)
  const status = String(formData.get('status') ?? 'ativo')
  const observacoes = String(formData.get('observacoes') ?? '').trim()
  const reguaCobrancaId = String(formData.get('regua_cobranca_id') ?? '').trim() || null
  const reguaAcordoId = String(formData.get('regua_acordo_id') ?? '').trim() || null

  if (!id) throw new Error('Condomínio obrigatório.')
  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (nome.length < 2) throw new Error('Nome do condomínio obrigatório.')
  if (!Number.isFinite(vencimentoCotaDia) || vencimentoCotaDia < 1 || vencimentoCotaDia > 31) throw new Error('Dia de vencimento deve ficar entre 1 e 31.')
  if (!Number.isFinite(inicioCobrancaDias) || inicioCobrancaDias < 0 || inicioCobrancaDias > 365) throw new Error('Início da cobrança deve ficar entre 0 e 365 dias.')

  const supabase = await createClient()
  const { data: before, error: beforeError } = await supabase
    .from('condominios')
    .select('id, carteira_id, nome, cnpj, administradora, vencimento_cota_dia, valor_cota_condominial, inicio_cobranca_dias, regua_cobranca_id, regua_acordo_id, status, observacoes')
    .eq('id', id)
    .maybeSingle()

  if (beforeError) throw new Error(`Erro ao carregar condomínio antes da alteração: ${beforeError.message}`)
  if (!before) throw new Error('Condomínio não encontrado.')

  const payload = {
    carteira_id: carteiraId,
    nome,
    cnpj: cnpj || null,
    administradora: administradora || null,
    vencimento_cota_dia: vencimentoCotaDia,
    valor_cota_condominial: valorCota,
    inicio_cobranca_dias: inicioCobrancaDias,
    regua_cobranca_id: reguaCobrancaId,
    regua_acordo_id: reguaAcordoId,
    status,
    observacoes: observacoes || null,
  }
  const diferencas = buildDiff(before as any, payload)

  const { error } = await supabase.from('condominios').update(payload).eq('id', id)
  if (error) throw new Error(`Erro ao atualizar Condomínio Integral: ${error.message}`)

  if (Object.keys(diferencas).length > 0) {
    await registrarAuditoria(supabase, {
      carteira_id: carteiraId,
      entidade_tipo: 'condominio',
      entidade_id: id,
      evento_tipo: 'alteracao_cadastro',
      titulo: 'Cadastro atualizado',
      descricao: `${Object.keys(diferencas).length} campo(s) alterado(s) no Condomínio Integral.`,
      usuario_id: user.id,
      usuario_nome: user.nome,
      usuario_email: user.email,
      antes: before,
      depois: payload,
      diferencas,
    })
  }

  revalidatePath('/app/condominios')
  revalidatePath(`/app/condominios/${id}`)
  redirect(`/app/condominios/${id}`)
}
