'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { registrarEventoOperacional } from '@/features/operacional/service'
import { getPermittedCarteiras, type CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { requireRole } from '@/utils/auth/require-role'
import { requireUser } from '@/utils/auth/require-user'
import { createClient } from '@/utils/supabase/server'

type SolicitacaoOrigem = 'cobranca' | 'unidade'

function assertCarteiraPermitida(scope: CarteiraScope, carteiraId: string | null | undefined) {
  if (!carteiraId || (scope.carteiraIds !== null && !scope.carteiraIds.includes(carteiraId))) {
    throw new Error('Você não tem acesso à carteira deste cadastro.')
  }
}

function addDaysIso(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

function relation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function redirectPath(origem: SolicitacaoOrigem, id: string, resultado: 'solicitada' | 'existente') {
  return `/app/${origem === 'cobranca' ? 'cobrancas' : 'unidades'}/${id}?planilha=${resultado}`
}

export async function solicitarPlanilhaDebitosIndividual(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const supabase = await createClient()
  const origem = String(formData.get('origem') ?? '') as SolicitacaoOrigem
  const id = String(formData.get('id') ?? '').trim()

  if (!['cobranca', 'unidade'].includes(origem) || !id) {
    throw new Error('Informe a cobrança ou unidade para solicitar a planilha.')
  }

  let cobranca: any = null
  let unidade: any = null

  if (origem === 'cobranca') {
    const { data, error } = await supabase
      .from('cobrancas')
      .select(`
        id, carteira_id, condominio_id, unidade_id, competencia, vencimento,
        unidades:unidade_id(id, identificacao, bloco, responsavel_nome),
        condominios:condominio_id(id, nome, administradora_id)
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) throw new Error(`Erro ao carregar cobrança: ${error.message}`)
    if (!data) throw new Error('Cobrança não encontrada.')
    cobranca = data
    unidade = relation((data as any).unidades)
  } else {
    const { data, error } = await supabase
      .from('unidades')
      .select(`
        id, carteira_id, condominio_id, identificacao, bloco, responsavel_nome,
        condominios:condominio_id(id, nome, administradora_id)
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) throw new Error(`Erro ao carregar unidade: ${error.message}`)
    if (!data) throw new Error('Unidade não encontrada.')
    unidade = data
  }

  const carteiraId = String(cobranca?.carteira_id ?? unidade?.carteira_id ?? '')
  const condominioId = String(cobranca?.condominio_id ?? unidade?.condominio_id ?? '')
  const unidadeId = String(cobranca?.unidade_id ?? unidade?.id ?? '')
  const condominio = relation<any>(cobranca?.condominios ?? unidade?.condominios)

  if (!carteiraId || !condominioId || !unidadeId) {
    throw new Error('O cadastro não possui todos os vínculos necessários para a solicitação.')
  }

  const scope = await getPermittedCarteiras()
  assertCarteiraPermitida(scope, carteiraId)

  const { data: existente, error: existenteError } = await supabase
    .from('central_pendencias')
    .select('id')
    .eq('tipo', 'planilha_debitos_administradora')
    .eq('carteira_id', carteiraId)
    .eq('condominio_id', condominioId)
    .eq('unidade_id', unidadeId)
    .in('status', ['aberta', 'em_tratamento'])
    .limit(1)

  if (existenteError) throw new Error(`Erro ao verificar solicitação existente: ${existenteError.message}`)
  if (existente?.length) redirect(redirectPath(origem, id, 'existente'))

  const unidadeLabel = [
    unidade?.bloco ? `Bloco ${unidade.bloco}` : null,
    unidade?.identificacao ? `Unidade ${unidade.identificacao}` : null,
  ].filter(Boolean).join(' · ') || 'Unidade não informada'
  const cobrancaLabel = cobranca
    ? `, competência ${cobranca.competencia ?? '-'} e vencimento ${cobranca.vencimento ?? '-'}`
    : ''
  const escopoLabel = origem === 'cobranca' ? 'cobrança' : 'unidade'

  const { data: pendencia, error: insertError } = await supabase
    .from('central_pendencias')
    .insert({
      carteira_id: carteiraId,
      origem: 'administradora',
      tipo: 'planilha_debitos_administradora',
      status: 'aberta',
      prioridade: 'alta',
      titulo: `Solicitar planilha para atualizar ${escopoLabel}`,
      descricao: `Solicitar à administradora a planilha atualizada de débitos de ${condominio?.nome ?? 'condomínio não informado'}, ${unidadeLabel}${cobrancaLabel}. Pedido individual iniciado pelo prontuário da ${escopoLabel}.`,
      entidade_tipo: origem,
      entidade_id: id,
      condominio_id: condominioId,
      unidade_id: unidadeId,
      cobranca_id: cobranca?.id ?? null,
      acordo_id: null,
      administradora_id: condominio?.administradora_id ?? null,
      prazo_limite: addDaysIso(2),
      payload: {
        escopo: origem,
        origem_tela: 'prontuario',
        cobranca_id: cobranca?.id ?? null,
        unidade_id: unidadeId,
      },
    })
    .select('id')
    .single()

  if (insertError) throw new Error(`Erro ao criar solicitação de planilha: ${insertError.message}`)

  await registrarEventoOperacional(supabase as any, {
    carteiraId,
    entidadeTipo: origem,
    entidadeId: id,
    eventoCodigo: `${origem}.planilha_debitos_solicitada`,
    titulo: `Planilha solicitada para atualizar ${escopoLabel}`,
    descricao: `Pendência individual criada para solicitar a planilha atualizada à administradora.`,
    severidade: 'alerta',
    origem: 'manual',
    auditavel: true,
    userId: user?.id ?? null,
    payload: {
      pendencia_id: pendencia.id,
      condominio_id: condominioId,
      unidade_id: unidadeId,
      cobranca_id: cobranca?.id ?? null,
      administradora_id: condominio?.administradora_id ?? null,
      escopo: origem,
    },
  })

  revalidatePath('/app/pendencias')
  revalidatePath('/app/inbox')
  revalidatePath(`/app/unidades/${unidadeId}`)
  if (cobranca?.id) revalidatePath(`/app/cobrancas/${cobranca.id}`)

  redirect(redirectPath(origem, id, 'solicitada'))
}
