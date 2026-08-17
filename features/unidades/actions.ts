'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { requireRole } from '@/utils/auth/require-role'
import { requireUser } from '@/utils/auth/require-user'
import { getPermittedCarteiras, type CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { registrarEventoOperacional } from '@/features/operacional/service'

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function money(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim().replace(/\s/g, '').replace(/R\$/gi, '')
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
  const parsed = Number(normalized || 0)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

function assertCarteiraPermitida(scope: CarteiraScope, carteiraId: string | null | undefined) {
  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (scope.carteiraIds !== null && !scope.carteiraIds.includes(carteiraId)) {
    throw new Error('Você não tem permissão para operar esta carteira.')
  }
}

export async function createUnidade(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])

  const carteiraId = String(formData.get('carteira_id') ?? '')
  const condominioId = String(formData.get('condominio_id') ?? '')
  const identificacao = String(formData.get('identificacao') ?? '').trim()
  const bloco = String(formData.get('bloco') ?? '').trim()
  const responsavelNome = String(formData.get('responsavel_nome') ?? '').trim()
  const responsavelDocumento = onlyDigits(String(formData.get('responsavel_documento') ?? ''))
  const telefone = onlyDigits(String(formData.get('telefone') ?? ''))
  const email = String(formData.get('email') ?? '').trim()
  const observacoes = String(formData.get('observacoes') ?? '').trim()
  const acaoJudicial = formData.get('acao_judicial') === 'on'

  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (!condominioId) throw new Error('Condomínio obrigatório.')
  if (!identificacao) throw new Error('Identificação da unidade obrigatória.')

  const supabase = await createClient()
  const scope = await getPermittedCarteiras()
  assertCarteiraPermitida(scope, carteiraId)

  const { data: condominio, error: condominioError } = await supabase
    .from('condominios')
    .select('id, carteira_id')
    .eq('id', condominioId)
    .maybeSingle()

  if (condominioError) throw new Error(`Erro ao validar condomínio: ${condominioError.message}`)
  if (!condominio) throw new Error('Condomínio não encontrado.')
  if ((condominio as any).carteira_id !== carteiraId) {
    throw new Error('Condomínio não pertence à carteira informada.')
  }

  const { error } = await supabase.from('unidades').insert({
    carteira_id: carteiraId,
    condominio_id: condominioId,
    identificacao,
    bloco: bloco || null,
    responsavel_nome: responsavelNome || null,
    responsavel_documento: responsavelDocumento || null,
    telefone: telefone || null,
    email: email || null,
    status: 'ativa',
    observacoes: observacoes || null,
    acao_judicial: acaoJudicial,
  })

  if (error) {
    throw new Error(`Erro ao criar unidade: ${error.message}`)
  }

  revalidatePath('/app/unidades')
  redirect('/app/unidades')
}

export async function updateUnidade(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])

  const id = String(formData.get('id') ?? '').trim()
  const identificacao = String(formData.get('identificacao') ?? '').trim()
  const bloco = String(formData.get('bloco') ?? '').trim()
  const responsavelNome = String(formData.get('responsavel_nome') ?? '').trim()
  const responsavelDocumento = onlyDigits(String(formData.get('responsavel_documento') ?? ''))
  const telefone = onlyDigits(String(formData.get('telefone') ?? ''))
  const email = String(formData.get('email') ?? '').trim()
  const status = String(formData.get('status') ?? 'ativa').trim()
  const observacoes = String(formData.get('observacoes') ?? '').trim()
  const creditoAdministradora = money(formData.get('credito_administradora'))
  const acaoJudicial = formData.get('acao_judicial') === 'on'

  if (!id) throw new Error('Unidade obrigatória.')
  if (!identificacao) throw new Error('Identificação da unidade obrigatória.')
  if (creditoAdministradora < 0) throw new Error('Crédito da administradora não pode ser negativo.')

  const supabase = await createClient()
  const scope = await getPermittedCarteiras()

  const { data: unidadeAtual, error: unidadeAtualError } = await supabase
    .from('unidades')
    .select('id, carteira_id, condominio_id, credito_administradora, acao_judicial')
    .eq('id', id)
    .maybeSingle()

  if (unidadeAtualError) {
    throw new Error(`Erro ao carregar unidade atual: ${unidadeAtualError.message}`)
  }

  if (!unidadeAtual) {
    throw new Error('Unidade não encontrada.')
  }

  assertCarteiraPermitida(scope, (unidadeAtual as any).carteira_id)

  const carteiraForcada = String(formData.get('carteira_id') ?? '').trim()
  const condominioForcado = String(formData.get('condominio_id') ?? '').trim()

  if (carteiraForcada && carteiraForcada !== unidadeAtual.carteira_id) {
    throw new Error('A carteira da unidade não pode ser alterada pela edição do cadastro.')
  }

  if (condominioForcado && condominioForcado !== unidadeAtual.condominio_id) {
    throw new Error('O condomínio da unidade não pode ser alterado pela edição do cadastro.')
  }

  const { error } = await supabase
    .from('unidades')
    .update({
      identificacao,
      bloco: bloco || null,
      responsavel_nome: responsavelNome || null,
      responsavel_documento: responsavelDocumento || null,
      telefone: telefone || null,
      email: email || null,
      status: status || 'ativa',
      observacoes: observacoes || null,
      credito_administradora: creditoAdministradora,
      acao_judicial: acaoJudicial,
    })
    .eq('id', id)

  if (error) {
    throw new Error(`Erro ao atualizar unidade: ${error.message}`)
  }

  const creditoAnterior = Number((unidadeAtual as any).credito_administradora ?? 0)
  if (creditoAnterior !== creditoAdministradora) {
    const user = await requireUser()
    await registrarEventoOperacional(supabase as any, {
      carteiraId: (unidadeAtual as any).carteira_id,
      entidadeTipo: 'unidade',
      entidadeId: id,
      eventoCodigo: 'unidade.credito_administradora_alterado',
      titulo: 'Crédito da administradora atualizado',
      descricao: `Crédito alterado de ${creditoAnterior.toFixed(2)} para ${creditoAdministradora.toFixed(2)}.`,
      antes: { credito_administradora: creditoAnterior },
      depois: { credito_administradora: creditoAdministradora },
      origem: 'manual',
      auditavel: true,
      userId: user?.id ?? null,
    })
  }

  if (Boolean((unidadeAtual as any).acao_judicial) !== acaoJudicial) {
    const user = await requireUser()
    await registrarEventoOperacional(supabase as any, {
      carteiraId: (unidadeAtual as any).carteira_id,
      entidadeTipo: 'unidade',
      entidadeId: id,
      eventoCodigo: acaoJudicial ? 'unidade.acao_judicial_ativada' : 'unidade.acao_judicial_desativada',
      titulo: acaoJudicial ? 'Ação judicial ativada' : 'Ação judicial desativada',
      descricao: acaoJudicial
        ? 'Cobranças da unidade foram bloqueadas e novos acordos não poderão ser criados.'
        : 'Bloqueio cadastral removido. Cobranças judicializadas não foram reativadas automaticamente.',
      antes: { acao_judicial: Boolean((unidadeAtual as any).acao_judicial) },
      depois: { acao_judicial: acaoJudicial },
      origem: 'manual',
      auditavel: true,
      userId: user?.id ?? null,
    })
  }

  revalidatePath('/app/unidades')
  revalidatePath(`/app/unidades/${id}`)
  redirect(`/app/unidades/${id}`)
}

export async function updateUnidadesStatusEmLote(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])

  const ids = [...new Set(formData.getAll('unidade_ids').map((value) => String(value)).filter(Boolean))]
  const status = String(formData.get('status') ?? '').trim()
  const observacao = String(formData.get('observacao') ?? '').trim()
  const allowed = ['ativa', 'inativa', 'suspensa']

  if (ids.length === 0) throw new Error('Selecione ao menos uma unidade.')
  if (!allowed.includes(status)) throw new Error('Status inválido para alteração em lote.')

  const supabase = await createClient()
  const user = await requireUser()
  const scope = await getPermittedCarteiras()

  const { data: unidades, error: consultaError } = await supabase
    .from('unidades')
    .select('id, carteira_id, status')
    .in('id', ids)

  if (consultaError) {
    throw new Error(`Erro ao validar unidades selecionadas: ${consultaError.message}`)
  }

  if (!unidades?.length) {
    throw new Error('Nenhuma unidade selecionada foi encontrada.')
  }

  for (const unidade of unidades as any[]) {
    assertCarteiraPermitida(scope, unidade.carteira_id)
  }

  const idsPermitidos = (unidades as any[]).map((unidade) => unidade.id)

  const { error } = await supabase
    .from('unidades')
    .update({ status })
    .in('id', idsPermitidos)

  if (error) {
    throw new Error(`Erro ao atualizar unidades em lote: ${error.message}`)
  }

  await Promise.all(
    (unidades as any[]).map((unidade) =>
      registrarEventoOperacional(supabase as any, {
        carteiraId: unidade.carteira_id ?? null,
        entidadeTipo: 'unidade',
        entidadeId: unidade.id,
        eventoCodigo: 'unidade.status_alterado_lote',
        estadoAnterior: unidade.status ?? null,
        estadoNovo: status,
        titulo: 'Status da unidade alterado em lote',
        descricao: observacao || `Status alterado em lote para ${status}.`,
        severidade: status === 'suspensa' ? 'alerta' : 'info',
        userId: user?.id ?? null,
        payload: { total_selecionadas: idsPermitidos.length },
      }),
    ),
  )

  revalidatePath('/app/unidades')
  revalidatePath('/app')
  revalidatePath('/app/dashboard')
}
