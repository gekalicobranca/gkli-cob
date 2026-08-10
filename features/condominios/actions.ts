'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { requireUser } from '@/utils/auth/require-user'
import { requireRole } from '@/utils/auth/require-role'
import { getPermittedCarteiras, type CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function optionalText(formData: FormData, field: string) {
  return String(formData.get(field) ?? '').trim() || null
}

function assertCarteiraPermitida(scope: CarteiraScope, carteiraId: string | null | undefined) {
  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (scope.carteiraIds !== null && !scope.carteiraIds.includes(carteiraId)) {
    throw new Error('Você não tem permissão para operar esta carteira.')
  }
}

function toInteger(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback
}

function toOptionalInteger(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null
}

function toNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? '0').replace('.', '').replace(',', '.')
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

const CLASSIFICACOES_CONDOMINIO = ['ouro', 'prata', 'bronze'] as const

function normalizeClassificacaoOperacional(value: FormDataEntryValue | null) {
  const classificacao = String(value ?? 'prata').trim().toLowerCase()
  return CLASSIFICACOES_CONDOMINIO.includes(classificacao as any) ? classificacao : 'prata'
}

function checkboxOn(value: FormDataEntryValue | null) {
  return String(value ?? '').toLowerCase() === 'on'
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
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()

  const carteiraId = String(formData.get('carteira_id') ?? '')
  const nome = String(formData.get('nome') ?? '').trim()
  const nomeOperacional = String(formData.get('nome_operacional') ?? '').trim()
  const cnpj = onlyDigits(String(formData.get('cnpj') ?? ''))
  const enderecoLogradouro = optionalText(formData, 'endereco_logradouro')
  const enderecoNumero = optionalText(formData, 'endereco_numero')
  const enderecoComplemento = optionalText(formData, 'endereco_complemento')
  const enderecoBairro = optionalText(formData, 'endereco_bairro')
  const enderecoCidade = optionalText(formData, 'endereco_cidade')
  const enderecoUf = optionalText(formData, 'endereco_uf')?.toUpperCase() ?? null
  const enderecoCep = onlyDigits(String(formData.get('endereco_cep') ?? '')) || null
  const administradora = String(formData.get('administradora') ?? '').trim()
  const vencimentoCotaDia = Number(formData.get('vencimento_cota_dia') ?? 10)
  const valorCota = toNumber(formData.get('valor_cota_condominial'))
  const inicioCobrancaDias = Number(formData.get('inicio_cobranca_dias') ?? 30)
  const diasExpiracaoReguaPreJuridico = toOptionalInteger(formData.get('dias_expiracao_regua_pre_juridico'))
  const parcelasAcordoSemAprovacaoSindico = toInteger(formData.get('parcelas_acordo_sem_aprovacao_sindico'), 0)
  const diasReemissaoParcelaAcordoAtrasada = toInteger(formData.get('dias_reemissao_parcela_acordo_atrasada'), 0)
  const classificacaoOperacional = normalizeClassificacaoOperacional(formData.get('classificacao_operacional'))
  const operacaoVirtualHabilitada = checkboxOn(formData.get('operacao_virtual_habilitada'))
  const captacaoAutomaticaHabilitada = checkboxOn(formData.get('captacao_automatica_habilitada'))
  const captacaoDiaMes = toOptionalInteger(formData.get('captacao_dia_mes'))
  const captacaoHorario = String(formData.get('captacao_horario') ?? '08:00').trim() || '08:00'
  const observacoes = String(formData.get('observacoes') ?? '').trim()
  const reguaCobrancaId = String(formData.get('regua_cobranca_id') ?? '').trim() || null
  const reguaAcordoId = String(formData.get('regua_acordo_id') ?? '').trim() || null

  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (nome.length < 2) throw new Error('Nome do condomínio obrigatório.')

  if (captacaoAutomaticaHabilitada && (!captacaoDiaMes || captacaoDiaMes < 1 || captacaoDiaMes > 28)) throw new Error('Informe um dia mensal entre 1 e 28 para a captação automática.')

  const supabase = await createClient()
  const scope = await getPermittedCarteiras()
  assertCarteiraPermitida(scope, carteiraId)
  const payload = {
    carteira_id: carteiraId,
    nome,
    nome_operacional: nomeOperacional || nome,
    cnpj: cnpj || null,
    endereco_logradouro: enderecoLogradouro,
    endereco_numero: enderecoNumero,
    endereco_complemento: enderecoComplemento,
    endereco_bairro: enderecoBairro,
    endereco_cidade: enderecoCidade,
    endereco_uf: enderecoUf,
    endereco_cep: enderecoCep,
    administradora: administradora || null,
    vencimento_cota_dia: vencimentoCotaDia,
    valor_cota_condominial: valorCota,
    inicio_cobranca_dias: inicioCobrancaDias,
    dias_expiracao_regua_pre_juridico: diasExpiracaoReguaPreJuridico,
    parcelas_acordo_sem_aprovacao_sindico: parcelasAcordoSemAprovacaoSindico,
    dias_reemissao_parcela_acordo_atrasada: diasReemissaoParcelaAcordoAtrasada,
    classificacao_operacional: classificacaoOperacional,
    operacao_virtual_habilitada: operacaoVirtualHabilitada,
    captacao_automatica_habilitada: captacaoAutomaticaHabilitada,
    captacao_dia_mes: captacaoDiaMes,
    captacao_horario: captacaoHorario,
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
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()

  const id = String(formData.get('id') ?? '')
  const carteiraId = String(formData.get('carteira_id') ?? '')
  const nome = String(formData.get('nome') ?? '').trim()
  const nomeOperacional = String(formData.get('nome_operacional') ?? '').trim()
  const cnpj = onlyDigits(String(formData.get('cnpj') ?? ''))
  const enderecoLogradouro = optionalText(formData, 'endereco_logradouro')
  const enderecoNumero = optionalText(formData, 'endereco_numero')
  const enderecoComplemento = optionalText(formData, 'endereco_complemento')
  const enderecoBairro = optionalText(formData, 'endereco_bairro')
  const enderecoCidade = optionalText(formData, 'endereco_cidade')
  const enderecoUf = optionalText(formData, 'endereco_uf')?.toUpperCase() ?? null
  const enderecoCep = onlyDigits(String(formData.get('endereco_cep') ?? '')) || null
  const administradora = String(formData.get('administradora') ?? '').trim()
  const vencimentoCotaDia = Number(formData.get('vencimento_cota_dia') ?? 10)
  const valorCota = toNumber(formData.get('valor_cota_condominial'))
  const inicioCobrancaDias = Number(formData.get('inicio_cobranca_dias') ?? 30)
  const diasExpiracaoReguaPreJuridico = toOptionalInteger(formData.get('dias_expiracao_regua_pre_juridico'))
  const parcelasAcordoSemAprovacaoSindico = toInteger(formData.get('parcelas_acordo_sem_aprovacao_sindico'), 0)
  const diasReemissaoParcelaAcordoAtrasada = toInteger(formData.get('dias_reemissao_parcela_acordo_atrasada'), 0)
  const classificacaoOperacional = normalizeClassificacaoOperacional(formData.get('classificacao_operacional'))
  const operacaoVirtualHabilitada = checkboxOn(formData.get('operacao_virtual_habilitada'))
  const captacaoAutomaticaHabilitada = checkboxOn(formData.get('captacao_automatica_habilitada'))
  const captacaoDiaMes = toOptionalInteger(formData.get('captacao_dia_mes'))
  const captacaoHorario = String(formData.get('captacao_horario') ?? '08:00').trim() || '08:00'
  const status = String(formData.get('status') ?? 'ativo')
  const observacoes = String(formData.get('observacoes') ?? '').trim()
  const reguaCobrancaId = String(formData.get('regua_cobranca_id') ?? '').trim() || null
  const reguaAcordoId = String(formData.get('regua_acordo_id') ?? '').trim() || null

  if (!id) throw new Error('Condomínio obrigatório.')
  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (nome.length < 2) throw new Error('Nome do condomínio obrigatório.')
  if (!Number.isFinite(vencimentoCotaDia) || vencimentoCotaDia < 1 || vencimentoCotaDia > 31) throw new Error('Dia de vencimento deve ficar entre 1 e 31.')
  if (!Number.isFinite(inicioCobrancaDias) || inicioCobrancaDias < 0 || inicioCobrancaDias > 365) throw new Error('Início da cobrança deve ficar entre 0 e 365 dias.')
  if (captacaoAutomaticaHabilitada && (!captacaoDiaMes || captacaoDiaMes < 1 || captacaoDiaMes > 28)) throw new Error('Informe um dia mensal entre 1 e 28 para a captação automática.')

  const supabase = await createClient()
  const scope = await getPermittedCarteiras()
  const { data: before, error: beforeError } = await supabase
    .from('condominios')
    .select('id, carteira_id, nome, nome_operacional, cnpj, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep, administradora, vencimento_cota_dia, valor_cota_condominial, inicio_cobranca_dias, dias_expiracao_regua_pre_juridico, parcelas_acordo_sem_aprovacao_sindico, dias_reemissao_parcela_acordo_atrasada, classificacao_operacional, operacao_virtual_habilitada, captacao_automatica_habilitada, captacao_dia_mes, captacao_horario, regua_cobranca_id, regua_acordo_id, status, observacoes')
    .eq('id', id)
    .maybeSingle()

  if (beforeError) throw new Error(`Erro ao carregar condomínio antes da alteração: ${beforeError.message}`)
  if (!before) throw new Error('Condomínio não encontrado.')
  assertCarteiraPermitida(scope, (before as any).carteira_id)
  assertCarteiraPermitida(scope, carteiraId)

  if ((before as any).carteira_id !== carteiraId) {
    throw new Error('A carteira do condomínio não pode ser alterada pela edição do cadastro.')
  }

  const payload = {
    carteira_id: carteiraId,
    nome,
    nome_operacional: nomeOperacional || nome,
    cnpj: cnpj || null,
    endereco_logradouro: enderecoLogradouro,
    endereco_numero: enderecoNumero,
    endereco_complemento: enderecoComplemento,
    endereco_bairro: enderecoBairro,
    endereco_cidade: enderecoCidade,
    endereco_uf: enderecoUf,
    endereco_cep: enderecoCep,
    administradora: administradora || null,
    vencimento_cota_dia: vencimentoCotaDia,
    valor_cota_condominial: valorCota,
    inicio_cobranca_dias: inicioCobrancaDias,
    dias_expiracao_regua_pre_juridico: diasExpiracaoReguaPreJuridico,
    parcelas_acordo_sem_aprovacao_sindico: parcelasAcordoSemAprovacaoSindico,
    dias_reemissao_parcela_acordo_atrasada: diasReemissaoParcelaAcordoAtrasada,
    classificacao_operacional: classificacaoOperacional,
    operacao_virtual_habilitada: operacaoVirtualHabilitada,
    captacao_automatica_habilitada: captacaoAutomaticaHabilitada,
    captacao_dia_mes: captacaoDiaMes,
    captacao_horario: captacaoHorario,
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
