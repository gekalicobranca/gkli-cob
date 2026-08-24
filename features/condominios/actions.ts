'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { requireUser } from '@/utils/auth/require-user'
import { requireRole } from '@/utils/auth/require-role'
import { getPermittedCarteiras, type CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeCondominioName } from '@/features/condominios/normalize-name'

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function optionalText(formData: FormData, field: string) {
  return String(formData.get(field) ?? '').trim() || null
}

function optionalEmail(formData: FormData, field: string, label: string) {
  const value = String(formData.get(field) ?? '').trim().toLowerCase()
  if (!value) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error(`${label} inválido.`)
  }
  return value
}

function optionalPhone(formData: FormData, field: string) {
  return onlyDigits(String(formData.get(field) ?? '')) || null
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

function monthStart(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? '').trim()
  return /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : null
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
    // A alteração principal já foi persistida neste ponto. Uma indisponibilidade
    // da trilha de auditoria não deve transformar um salvamento bem-sucedido em
    // erro para o usuário nem incentivar o reenvio do mesmo formulário.
    console.error('Falha ao registrar auditoria de condomínio.', {
      code: error.code,
      message: error.message,
      entidadeId: payload.entidade_id,
      eventoTipo: payload.evento_tipo,
    })
  }
}

function cadastroMask(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? '').trim().toUpperCase()
  if (value && !/^[0A*._/-]+$/.test(value)) {
    throw new Error('Máscara inválida. Use 0 para número, A para letra e * para qualquer caractere.')
  }
  return value || null
}

export async function createCondominio(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()

  const carteiraId = String(formData.get('carteira_id') ?? '')
  const nome = normalizeCondominioName(String(formData.get('nome') ?? '').trim())
  const nomeOperacional = normalizeCondominioName(String(formData.get('nome_operacional') ?? '').trim())
  const cnpj = onlyDigits(String(formData.get('cnpj') ?? ''))
  const enderecoLogradouro = optionalText(formData, 'endereco_logradouro')
  const enderecoNumero = optionalText(formData, 'endereco_numero')
  const enderecoComplemento = optionalText(formData, 'endereco_complemento')
  const enderecoBairro = optionalText(formData, 'endereco_bairro')
  const enderecoCidade = optionalText(formData, 'endereco_cidade')
  const enderecoUf = optionalText(formData, 'endereco_uf')?.toUpperCase() ?? null
  const enderecoCep = onlyDigits(String(formData.get('endereco_cep') ?? '')) || null
  const administradora = String(formData.get('administradora') ?? '').trim()
  const sindicoEmail = optionalEmail(formData, 'sindico_email', 'E-mail do síndico')
  const sindicoCelular = optionalPhone(formData, 'sindico_celular')
  const gerenteEmail = optionalEmail(formData, 'gerente_email', 'E-mail do gerente')
  const gerenteCelular = optionalPhone(formData, 'gerente_celular')
  const vencimentoCotaDia = Number(formData.get('vencimento_cota_dia') ?? 10)
  const valorCota = toNumber(formData.get('valor_cota_condominial'))
  const inicioCobrancaDias = Number(formData.get('inicio_cobranca_dias') ?? 30)
  const diasCobrancaAtiva = toInteger(formData.get('dias_cobranca_ativa'), 60)
  const preJuridicoHabilitado = checkboxOn(formData.get('pre_juridico_habilitado'))
  const parcelasAcordoSemAprovacaoSindico = toInteger(formData.get('parcelas_acordo_sem_aprovacao_sindico'), 0)
  const diasReemissaoParcelaAcordoAtrasada = toInteger(formData.get('dias_reemissao_parcela_acordo_atrasada'), 0)
  const classificacaoOperacional = normalizeClassificacaoOperacional(formData.get('classificacao_operacional'))
  const operacaoVirtualHabilitada = checkboxOn(formData.get('operacao_virtual_habilitada'))
  const captacaoAutomaticaHabilitada = checkboxOn(formData.get('captacao_automatica_habilitada'))
  const captacaoDiaMes = toOptionalInteger(formData.get('captacao_dia_mes'))
  const captacaoHorario = String(formData.get('captacao_horario') ?? '08:00').trim() || '08:00'
  const bloqueioGarantidoraHabilitado = checkboxOn(formData.get('bloqueio_garantidora_habilitado'))
  const bloqueioGarantidoraInicio = monthStart(formData, 'bloqueio_garantidora_inicio')
  const bloqueioGarantidoraFim = monthStart(formData, 'bloqueio_garantidora_fim')
  const observacoes = String(formData.get('observacoes') ?? '').trim()
  const reguaCobrancaId = String(formData.get('regua_cobranca_id') ?? '').trim() || null
  const reguaAcordoId = String(formData.get('regua_acordo_id') ?? '').trim() || null
  const mascaraUnidade = cadastroMask(formData, 'mascara_unidade')
  const mascaraBloco = cadastroMask(formData, 'mascara_bloco')

  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (nome.length < 2) throw new Error('Nome do condomínio obrigatório.')
  if (diasCobrancaAtiva < 0 || diasCobrancaAtiva > 3650) throw new Error('Prazo de cobrança ativa deve ficar entre 0 e 3650 dias.')

  if (captacaoAutomaticaHabilitada && (!captacaoDiaMes || captacaoDiaMes < 1 || captacaoDiaMes > 28)) throw new Error('Informe um dia mensal entre 1 e 28 para a captação automática.')
  if (bloqueioGarantidoraHabilitado && (!bloqueioGarantidoraInicio || !bloqueioGarantidoraFim)) throw new Error('Informe o mês inicial e o mês final do Bloqueio Garantidora.')
  if (bloqueioGarantidoraInicio && bloqueioGarantidoraFim && bloqueioGarantidoraInicio > bloqueioGarantidoraFim) throw new Error('O mês inicial do Bloqueio Garantidora deve ser anterior ou igual ao mês final.')

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
    sindico_email: sindicoEmail,
    sindico_celular: sindicoCelular,
    gerente_email: gerenteEmail,
    gerente_celular: gerenteCelular,
    vencimento_cota_dia: vencimentoCotaDia,
    valor_cota_condominial: valorCota,
    inicio_cobranca_dias: inicioCobrancaDias,
    dias_cobranca_ativa: diasCobrancaAtiva,
    pre_juridico_habilitado: preJuridicoHabilitado,
    dias_expiracao_regua_pre_juridico: preJuridicoHabilitado ? diasCobrancaAtiva : null,
    parcelas_acordo_sem_aprovacao_sindico: parcelasAcordoSemAprovacaoSindico,
    dias_reemissao_parcela_acordo_atrasada: diasReemissaoParcelaAcordoAtrasada,
    classificacao_operacional: classificacaoOperacional,
    operacao_virtual_habilitada: operacaoVirtualHabilitada,
    captacao_automatica_habilitada: captacaoAutomaticaHabilitada,
    captacao_dia_mes: captacaoDiaMes,
    captacao_horario: captacaoHorario,
    bloqueio_garantidora_habilitado: bloqueioGarantidoraHabilitado,
    bloqueio_garantidora_inicio: bloqueioGarantidoraInicio,
    bloqueio_garantidora_fim: bloqueioGarantidoraFim,
    regua_cobranca_id: reguaCobrancaId,
    regua_acordo_id: reguaAcordoId,
    mascara_unidade: mascaraUnidade,
    mascara_bloco: mascaraBloco,
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
  const nome = normalizeCondominioName(String(formData.get('nome') ?? '').trim())
  const nomeOperacional = normalizeCondominioName(String(formData.get('nome_operacional') ?? '').trim())
  const cnpj = onlyDigits(String(formData.get('cnpj') ?? ''))
  const enderecoLogradouro = optionalText(formData, 'endereco_logradouro')
  const enderecoNumero = optionalText(formData, 'endereco_numero')
  const enderecoComplemento = optionalText(formData, 'endereco_complemento')
  const enderecoBairro = optionalText(formData, 'endereco_bairro')
  const enderecoCidade = optionalText(formData, 'endereco_cidade')
  const enderecoUf = optionalText(formData, 'endereco_uf')?.toUpperCase() ?? null
  const enderecoCep = onlyDigits(String(formData.get('endereco_cep') ?? '')) || null
  const administradora = String(formData.get('administradora') ?? '').trim()
  const sindicoEmail = optionalEmail(formData, 'sindico_email', 'E-mail do síndico')
  const sindicoCelular = optionalPhone(formData, 'sindico_celular')
  const gerenteEmail = optionalEmail(formData, 'gerente_email', 'E-mail do gerente')
  const gerenteCelular = optionalPhone(formData, 'gerente_celular')
  const vencimentoCotaDia = Number(formData.get('vencimento_cota_dia') ?? 10)
  const valorCota = toNumber(formData.get('valor_cota_condominial'))
  const inicioCobrancaDias = Number(formData.get('inicio_cobranca_dias') ?? 30)
  const diasCobrancaAtiva = toInteger(formData.get('dias_cobranca_ativa'), 60)
  const preJuridicoHabilitado = checkboxOn(formData.get('pre_juridico_habilitado'))
  const parcelasAcordoSemAprovacaoSindico = toInteger(formData.get('parcelas_acordo_sem_aprovacao_sindico'), 0)
  const diasReemissaoParcelaAcordoAtrasada = toInteger(formData.get('dias_reemissao_parcela_acordo_atrasada'), 0)
  const classificacaoOperacional = normalizeClassificacaoOperacional(formData.get('classificacao_operacional'))
  const operacaoVirtualHabilitada = checkboxOn(formData.get('operacao_virtual_habilitada'))
  const captacaoAutomaticaHabilitada = checkboxOn(formData.get('captacao_automatica_habilitada'))
  const captacaoDiaMes = toOptionalInteger(formData.get('captacao_dia_mes'))
  const captacaoHorario = String(formData.get('captacao_horario') ?? '08:00').trim() || '08:00'
  const bloqueioGarantidoraHabilitado = checkboxOn(formData.get('bloqueio_garantidora_habilitado'))
  const bloqueioGarantidoraInicio = monthStart(formData, 'bloqueio_garantidora_inicio')
  const bloqueioGarantidoraFim = monthStart(formData, 'bloqueio_garantidora_fim')
  const status = String(formData.get('status') ?? 'ativo')
  const observacoes = String(formData.get('observacoes') ?? '').trim()
  const reguaCobrancaId = String(formData.get('regua_cobranca_id') ?? '').trim() || null
  const reguaAcordoId = String(formData.get('regua_acordo_id') ?? '').trim() || null
  const mascaraUnidade = cadastroMask(formData, 'mascara_unidade')
  const mascaraBloco = cadastroMask(formData, 'mascara_bloco')

  if (!id) throw new Error('Condomínio obrigatório.')
  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (nome.length < 2) throw new Error('Nome do condomínio obrigatório.')
  if (!Number.isFinite(vencimentoCotaDia) || vencimentoCotaDia < 1 || vencimentoCotaDia > 31) throw new Error('Dia de vencimento deve ficar entre 1 e 31.')
  if (!Number.isFinite(inicioCobrancaDias) || inicioCobrancaDias < 0 || inicioCobrancaDias > 365) throw new Error('Início da cobrança deve ficar entre 0 e 365 dias.')
  if (diasCobrancaAtiva < 0 || diasCobrancaAtiva > 3650) throw new Error('Prazo de cobrança ativa deve ficar entre 0 e 3650 dias.')
  if (captacaoAutomaticaHabilitada && (!captacaoDiaMes || captacaoDiaMes < 1 || captacaoDiaMes > 28)) throw new Error('Informe um dia mensal entre 1 e 28 para a captação automática.')
  if (bloqueioGarantidoraHabilitado && (!bloqueioGarantidoraInicio || !bloqueioGarantidoraFim)) throw new Error('Informe o mês inicial e o mês final do Bloqueio Garantidora.')
  if (bloqueioGarantidoraInicio && bloqueioGarantidoraFim && bloqueioGarantidoraInicio > bloqueioGarantidoraFim) throw new Error('O mês inicial do Bloqueio Garantidora deve ser anterior ou igual ao mês final.')

  const supabase = await createClient()
  const scope = await getPermittedCarteiras()
  const { data: before, error: beforeError } = await supabase
    .from('condominios')
    .select('id, carteira_id, nome, nome_operacional, cnpj, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep, administradora, sindico_email, sindico_celular, gerente_email, gerente_celular, vencimento_cota_dia, valor_cota_condominial, inicio_cobranca_dias, dias_cobranca_ativa, pre_juridico_habilitado, dias_expiracao_regua_pre_juridico, parcelas_acordo_sem_aprovacao_sindico, dias_reemissao_parcela_acordo_atrasada, classificacao_operacional, operacao_virtual_habilitada, captacao_automatica_habilitada, captacao_dia_mes, captacao_horario, bloqueio_garantidora_habilitado, bloqueio_garantidora_inicio, bloqueio_garantidora_fim, regua_cobranca_id, regua_acordo_id, mascara_unidade, mascara_bloco, status, observacoes')
    .eq('id', id)
    .maybeSingle()

  if (beforeError) throw new Error(`Erro ao carregar condomínio antes da alteração: ${beforeError.message}`)
  if (!before) throw new Error('Condomínio não encontrado.')
  assertCarteiraPermitida(scope, (before as any).carteira_id)
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
    sindico_email: sindicoEmail,
    sindico_celular: sindicoCelular,
    gerente_email: gerenteEmail,
    gerente_celular: gerenteCelular,
    vencimento_cota_dia: vencimentoCotaDia,
    valor_cota_condominial: valorCota,
    inicio_cobranca_dias: inicioCobrancaDias,
    dias_cobranca_ativa: diasCobrancaAtiva,
    pre_juridico_habilitado: preJuridicoHabilitado,
    dias_expiracao_regua_pre_juridico: preJuridicoHabilitado ? diasCobrancaAtiva : null,
    parcelas_acordo_sem_aprovacao_sindico: parcelasAcordoSemAprovacaoSindico,
    dias_reemissao_parcela_acordo_atrasada: diasReemissaoParcelaAcordoAtrasada,
    classificacao_operacional: classificacaoOperacional,
    operacao_virtual_habilitada: operacaoVirtualHabilitada,
    captacao_automatica_habilitada: captacaoAutomaticaHabilitada,
    captacao_dia_mes: captacaoDiaMes,
    captacao_horario: captacaoHorario,
    bloqueio_garantidora_habilitado: bloqueioGarantidoraHabilitado,
    bloqueio_garantidora_inicio: bloqueioGarantidoraInicio,
    bloqueio_garantidora_fim: bloqueioGarantidoraFim,
    regua_cobranca_id: reguaCobrancaId,
    regua_acordo_id: reguaAcordoId,
    mascara_unidade: mascaraUnidade,
    mascara_bloco: mascaraBloco,
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
