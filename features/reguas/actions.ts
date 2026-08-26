'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/utils/supabase/admin'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { requireUser } from '@/utils/auth/require-user'
import { registrarEventoOperacional } from '@/features/operacional/service'
import type { ReguaTipo } from './types'
import { normalizarDestinatarioPreferencial } from '@/features/regua/services/regua-shared'

function s(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function n(formData: FormData, key: string, fallback = 0) {
  const parsed = Number(s(formData, key) || fallback)
  return Number.isFinite(parsed) ? parsed : fallback
}

function checkboxOn(formData: FormData, key: string) {
  return formData.getAll(key).some((value) => value === 'on')
}

async function resolveCarteiraId(formData: FormData) {
  const scope = await getPermittedCarteiras()
  const carteiraId = s(formData, 'carteira_id') || null

  if (!carteiraId) {
    if (scope.isAdmin) return null
    if (scope.carteiraIds?.length === 1) return scope.carteiraIds[0]
    throw new Error('Selecione uma carteira para a régua.')
  }

  if (!scope.isAdmin && !scope.carteiraIds?.includes(carteiraId)) {
    throw new Error('Você não tem permissão para usar esta carteira.')
  }

  return carteiraId
}

function buildReguaPayload(formData: FormData, carteiraId: string | null) {
  const nome = s(formData, 'nome')
  const tipo = (s(formData, 'tipo') || 'cobranca') as ReguaTipo
  const status = s(formData, 'status') || 'ativa'

  if (!nome) throw new Error('Informe o nome da régua.')
  if (!['cobranca', 'acordo', 'juridico'].includes(tipo)) throw new Error('Tipo de régua inválido.')
  if (tipo === 'juridico' && !carteiraId) throw new Error('Selecione a carteira da régua pré-jurídica.')

  return {
    carteira_id: carteiraId,
    nome,
    tipo,
    status,
    ativo: status !== 'inativa',
    descricao: s(formData, 'descricao') || null,
    prioridade: n(formData, 'prioridade', 0),
    padrao: formData.get('padrao') === 'on',
    destinatario_preferencial: normalizarDestinatarioPreferencial(s(formData, 'destinatario_preferencial')),
    updated_at: new Date().toISOString(),
  }
}

export async function criarReguaOperacional(formData: FormData) {
  const user = await requireUser()
  const carteiraId = await resolveCarteiraId(formData)
  const supabase = createAdminClient()
  const payload = buildReguaPayload(formData, carteiraId)
  const now = new Date().toISOString()

  if (payload.tipo === 'juridico' && carteiraId) {
    const { data: existente, error: existenteError } = await supabase
      .from('reguas')
      .select('id')
      .eq('tipo', 'juridico')
      .eq('carteira_id', carteiraId)
      .eq('ativo', true)
      .limit(1)
      .maybeSingle()
    if (existenteError) throw new Error(`Erro ao verificar régua da carteira: ${existenteError.message}`)
    if (existente?.id) throw new Error('Esta carteira já possui uma régua pré-jurídica ativa.')
  }

  const { data, error } = await supabase
    .from('reguas')
    .insert({ ...payload, created_at: now } as any)
    .select('id, carteira_id, nome, tipo')
    .single()

  if (error) throw new Error(`Erro ao criar régua: ${error.message}`)

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (data as any).carteira_id,
    entidadeTipo: 'regua',
    entidadeId: (data as any).id,
    eventoCodigo: 'regua.criada',
    titulo: 'Régua criada',
    descricao: `Régua ${(data as any).nome} criada para ${String((data as any).tipo)}.`,
    severidade: 'info',
    userId: user.id,
    payload: { origem: 'manual' },
  })

  revalidatePath('/app/mensageria/reguas')
  revalidatePath('/app/pre-juridico/regua')
  redirect(`/app/mensageria/reguas/${(data as any).id}`)
}

export async function atualizarReguaOperacional(id: string, formData: FormData) {
  const user = await requireUser()
  const carteiraId = await resolveCarteiraId(formData)
  const supabase = createAdminClient()
  const payload = buildReguaPayload(formData, carteiraId)

  const { data: before } = await supabase
    .from('reguas')
    .select('id, carteira_id, nome, tipo, status')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase
    .from('reguas')
    .update(payload as any)
    .eq('id', id)

  if (error) throw new Error(`Erro ao atualizar régua: ${error.message}`)

  await registrarEventoOperacional(supabase as any, {
    carteiraId,
    entidadeTipo: 'regua',
    entidadeId: id,
    eventoCodigo: 'regua.atualizada',
    estadoAnterior: (before as any)?.status ?? null,
    estadoNovo: payload.status,
    titulo: 'Régua atualizada',
    descricao: 'Dados principais da régua foram atualizados.',
    severidade: 'info',
    userId: user.id,
    payload: { antes: before, depois: payload, origem: 'manual' },
  })

  revalidatePath('/app/mensageria/reguas')
  revalidatePath('/app/pre-juridico/regua')
  revalidatePath(`/app/mensageria/reguas/${id}`)
}

export async function salvarEtapaRegua(reguaId: string, formData: FormData) {
  const user = await requireUser()
  const supabase = createAdminClient()
  const etapaId = s(formData, 'etapa_id') || null
  const nome = s(formData, 'nome') || `Etapa ${n(formData, 'ordem', 1)}`
  const canal = s(formData, 'canal') || 'whatsapp'
  const template = s(formData, 'template')

  const payload = {
    regua_id: reguaId,
    ordem: n(formData, 'ordem', 1),
    nome,
    delay_dias: n(formData, 'delay_dias', 0),
    delay_referencia: s(formData, 'delay_referencia') || 'vencimento',
    canal,
    template_id: s(formData, 'template_id') || null,
    categoria_template: s(formData, 'categoria_template') || (s(formData, 'delay_referencia') === 'parcela' ? 'lembrete_acordo' : 'cobranca_inicial'),
    template: template || null,
    tom: s(formData, 'tom') || 'medio',
    horario_inicio: s(formData, 'horario_inicio') || null,
    horario_fim: s(formData, 'horario_fim') || null,
    acao: s(formData, 'acao') || 'enviar_mensagem',
    ativo: checkboxOn(formData, 'ativo'),
    updated_at: new Date().toISOString(),
  }

  let error
  let id = etapaId
  if (etapaId) {
    const response = await supabase.from('regua_etapas').update(payload as any).eq('id', etapaId)
    error = response.error
  } else {
    const response = await supabase.from('regua_etapas').insert({ ...payload, created_at: new Date().toISOString() } as any).select('id').single()
    error = response.error
    id = (response.data as any)?.id ?? null
  }

  if (error) throw new Error(`Erro ao salvar etapa: ${error.message}`)

  await registrarEventoOperacional(supabase as any, {
    carteiraId: null,
    entidadeTipo: 'regua',
    entidadeId: reguaId,
    eventoCodigo: etapaId ? 'regua.etapa_atualizada' : 'regua.etapa_criada',
    titulo: etapaId ? 'Etapa atualizada' : 'Etapa criada',
    descricao: `Etapa ${nome} salva na régua.`,
    severidade: 'info',
    userId: user.id,
    payload: { etapa_id: id, origem: 'manual' },
  })

  revalidatePath(`/app/mensageria/reguas/${reguaId}`)
}

export async function alternarEtapaRegua(etapaId: string, reguaId: string, ativo: boolean) {
  await requireUser()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('regua_etapas')
    .update({ ativo, updated_at: new Date().toISOString() } as any)
    .eq('id', etapaId)

  if (error) throw new Error(`Erro ao alterar etapa: ${error.message}`)
  revalidatePath(`/app/mensageria/reguas/${reguaId}`)
}

export async function excluirReguaOperacional(id: string) {
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const supabase = createAdminClient()

  const { data: regua, error: reguaError } = await supabase
    .from('reguas')
    .select('id, carteira_id, nome, tipo')
    .eq('id', id)
    .maybeSingle()

  if (reguaError) throw new Error(`Erro ao carregar régua: ${reguaError.message}`)
  if (!regua) throw new Error('Régua não encontrada.')

  const carteiraId = (regua as any).carteira_id as string | null
  if (!scope.isAdmin && carteiraId && !scope.carteiraIds?.includes(carteiraId)) {
    throw new Error('Você não tem permissão para excluir esta régua.')
  }

  const { count: etapasCount, error: etapasError } = await supabase
    .from('regua_etapas')
    .select('id', { count: 'exact', head: true })
    .eq('regua_id', id)

  if (etapasError) throw new Error(`Erro ao validar etapas da régua: ${etapasError.message}`)
  if ((etapasCount ?? 0) > 0) {
    throw new Error('Esta régua já possui etapas. Inative a régua ou remova as etapas antes de excluir.')
  }

  const coluna = (regua as any).tipo === 'acordo'
    ? 'regua_acordo_id'
    : (regua as any).tipo === 'juridico'
      ? 'regua_pre_juridico_id'
      : 'regua_cobranca_id'
  const { count: vinculosCount, error: vinculosError } = await supabase
    .from('condominios')
    .select('id', { count: 'exact', head: true })
    .eq(coluna, id)

  if (vinculosError) throw new Error(`Erro ao validar vínculos da régua: ${vinculosError.message}`)
  if ((vinculosCount ?? 0) > 0) {
    throw new Error('Esta régua está vinculada a condomínio. Remova o vínculo ou inative a régua.')
  }

  const { error } = await supabase.from('reguas').delete().eq('id', id)
  if (error) throw new Error(`Erro ao excluir régua: ${error.message}`)

  try {
    await registrarEventoOperacional(supabase as any, {
      carteiraId,
      entidadeTipo: 'regua',
      entidadeId: id,
      eventoCodigo: 'regua.excluida',
      titulo: 'Régua excluída',
      descricao: `Régua ${(regua as any).nome} excluída.`,
      severidade: 'info',
      userId: user.id,
      payload: { origem: 'manual' },
    })
  } catch {
    // A exclusão já foi concluída; falha de auditoria não deve bloquear o retorno à lista.
  }

  revalidatePath('/app/mensageria/reguas')
  redirect('/app/mensageria/reguas')
}
