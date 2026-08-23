'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/utils/auth/require-role'
import { requireUser } from '@/utils/auth/require-user'
import { getPermittedCarteiras, type CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import { PRE_JURIDICO_ETAPAS, type PreJuridicoEtapa } from './etapas'
import { listPreJuridicoCobrancas } from './queries'
import { registrarEventoOperacional } from '@/features/operacional/service'

function assertCarteiraPermitida(scope: CarteiraScope, carteiraId: string | null | undefined) {
  if (!carteiraId || (scope.carteiraIds !== null && !scope.carteiraIds.includes(carteiraId))) {
    throw new Error('Você não tem acesso à carteira deste caso.')
  }
}

export async function atualizarEtapaPreJuridico(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const supabase = await createClient()
  const casoId = String(formData.get('caso_id') ?? '').trim()
  const etapa = String(formData.get('etapa') ?? '').trim() as PreJuridicoEtapa
  const observacoes = String(formData.get('observacoes') ?? '').trim() || null
  const numeroProcesso = String(formData.get('numero_processo') ?? '').trim() || null
  const escritorio = String(formData.get('escritorio_juridico') ?? '').trim() || null
  const prazoEtapa = String(formData.get('prazo_etapa') ?? '').trim() || null
  const protocoloEnvio = String(formData.get('protocolo_envio') ?? '').trim() || null
  const tribunal = String(formData.get('tribunal') ?? '').trim() || null
  const foro = String(formData.get('foro') ?? '').trim() || null

  if (!casoId) throw new Error('Caso pré-jurídico obrigatório.')
  if (!PRE_JURIDICO_ETAPAS.some((item) => item.id === etapa)) throw new Error('Etapa pré-jurídica inválida.')
  if (prazoEtapa && !/^\d{4}-\d{2}-\d{2}$/.test(prazoEtapa)) throw new Error('Prazo da etapa inválido.')
  if (etapa === 'judicializado' && !numeroProcesso) throw new Error('Informe o número do processo para concluir a judicialização.')

  const { data: caso, error: casoError } = await supabase
    .from('pre_juridico_casos')
    .select('id,carteira_id,unidade_id,etapa')
    .eq('id', casoId)
    .maybeSingle()
  if (casoError) throw new Error(`Erro ao carregar caso pré-jurídico: ${casoError.message}`)
  if (!caso) throw new Error('Caso pré-jurídico não encontrado.')
  assertCarteiraPermitida(scope, caso.carteira_id)

  const agora = new Date().toISOString()
  const payload: Record<string, unknown> = {
    etapa,
    observacoes,
    escritorio_juridico: escritorio,
    numero_processo: numeroProcesso,
    prazo_etapa: prazoEtapa,
    protocolo_envio: protocoloEnvio,
    tribunal,
    foro,
    responsavel_id: user.id,
  }
  if (etapa === 'enviado_juridico') payload.enviado_juridico_em = agora
  if (etapa === 'judicializado') payload.judicializado_em = agora

  const { error } = await supabase.from('pre_juridico_casos').update(payload).eq('id', casoId)
  if (error) throw new Error(`Erro ao atualizar etapa pré-jurídica: ${error.message}`)

  revalidatePath('/app/pre-juridico')
  revalidatePath('/app/pre-juridico/processamento')
  revalidatePath('/app/pre-juridico/monitor')
}

export async function atualizarCertidaoPreJuridico(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const supabase = await createClient()
  const casoId = String(formData.get('caso_id') ?? '').trim()
  const status = String(formData.get('certidao_status') ?? '').trim()
  const observacoes = String(formData.get('observacoes') ?? '').trim() || null
  if (!casoId) throw new Error('Caso pré-jurídico obrigatório.')
  if (!['pendente', 'solicitada', 'recebida'].includes(status)) throw new Error('Andamento da certidão inválido.')

  const { data: caso, error: casoError } = await supabase
    .from('pre_juridico_casos')
    .select('id,carteira_id,cobranca_id,condominio_id,unidade_id,etapa,certidao_status,certidao_solicitada_em,certidao_recebida_em')
    .eq('id', casoId)
    .maybeSingle()
  if (casoError) throw new Error(`Erro ao carregar a confirmação de propriedade: ${casoError.message}`)
  if (!caso) throw new Error('Caso pré-jurídico não encontrado.')
  assertCarteiraPermitida(scope, caso.carteira_id)
  if (caso.etapa !== 'aguardando_documentos') throw new Error('Este caso não está na etapa de confirmação de propriedade.')

  const agora = new Date().toISOString()
  const payload: Record<string, unknown> = {
    certidao_status: status,
    observacoes,
    responsavel_id: user.id,
  }
  if (status === 'solicitada' && !caso.certidao_solicitada_em) payload.certidao_solicitada_em = agora
  if (status === 'recebida') {
    payload.certidao_solicitada_em = caso.certidao_solicitada_em ?? agora
    payload.certidao_recebida_em = caso.certidao_recebida_em ?? agora
    payload.etapa = 'aguardando_sindico'
  }

  const { error } = await supabase.from('pre_juridico_casos').update(payload).eq('id', casoId)
  if (error) throw new Error(`Erro ao atualizar o andamento da certidão: ${error.message}`)

  if (caso.cobranca_id) {
    await registrarEventoOperacional(supabase as any, {
      carteiraId: caso.carteira_id,
      entidadeTipo: 'cobranca',
      entidadeId: caso.cobranca_id,
      eventoCodigo: status === 'recebida' ? 'cobranca.pre_juridico.certidao_recebida' : 'cobranca.pre_juridico.certidao_atualizada',
      titulo: status === 'recebida' ? 'Certidão recebida' : `Certidão ${status}`,
      descricao: status === 'recebida' ? 'Propriedade confirmada; caso encaminhado para Procuração.' : `Andamento da confirmação de propriedade atualizado para ${status}.`,
      severidade: 'info',
      payload: { caso_id: caso.id, certidao_status: status, condominio_id: caso.condominio_id, unidade_id: caso.unidade_id },
      origem: 'manual',
      auditavel: true,
      required: true,
      userId: user.id,
    })
  }

  revalidatePath('/app/pre-juridico/processamento')
  revalidatePath('/app/pre-juridico/monitor')
}

export async function gerarProcuracoesPreJuridico(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const supabase = await createClient()
  const casoIds = Array.from(new Set(formData.getAll('caso_id').map(String).map((id) => id.trim()).filter(Boolean)))
  if (!casoIds.length) throw new Error('Selecione ao menos um caso para gerar a procuração.')

  let query = supabase.from('pre_juridico_casos').select('id,carteira_id,cobranca_id,condominio_id,unidade_id,etapa').in('id', casoIds)
  query = applyCarteiraScope(query, scope.carteiraIds)
  const { data, error: casosError } = await query
  if (casosError) throw new Error(`Erro ao carregar casos para procuração: ${casosError.message}`)
  const casos = (data ?? []) as any[]
  if (casos.length !== casoIds.length || casos.some((caso) => caso.etapa !== 'aguardando_sindico' || !caso.cobranca_id)) throw new Error('Um ou mais casos não estão disponíveis para gerar procuração.')

  const agora = new Date().toISOString()
  const { error } = await supabase.from('pre_juridico_casos').update({ procuracao_status: 'gerada', procuracao_gerada_em: agora, responsavel_id: user.id }).in('id', casoIds)
  if (error) throw new Error(`Erro ao registrar a geração das procurações: ${error.message}`)
  for (const caso of casos) {
    await registrarEventoOperacional(supabase as any, { carteiraId: caso.carteira_id, entidadeTipo: 'cobranca', entidadeId: caso.cobranca_id, eventoCodigo: 'cobranca.pre_juridico.procuracao_gerada', titulo: 'Procuração gerada', descricao: 'Procuração preparada para coleta da assinatura do síndico.', severidade: 'info', payload: { caso_id: caso.id, condominio_id: caso.condominio_id, unidade_id: caso.unidade_id }, origem: 'manual', auditavel: true, required: true, userId: user.id })
  }
  revalidatePath('/app/pre-juridico/processamento')
  redirect(`/api/acordos/pre-juridico/procuracao/pdf?cobrancaIds=${encodeURIComponent(casos.map((caso) => caso.cobranca_id).join(','))}`)
}

export async function atualizarProcuracaoPreJuridico(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const supabase = await createClient()
  const casoId = String(formData.get('caso_id') ?? '').trim()
  const status = String(formData.get('procuracao_status') ?? '').trim()
  const observacoes = String(formData.get('observacoes') ?? '').trim() || null
  if (!['pendente', 'gerada', 'assinada'].includes(status)) throw new Error('Andamento da procuração inválido.')
  const { data: caso, error: casoError } = await supabase.from('pre_juridico_casos').select('id,carteira_id,cobranca_id,etapa,procuracao_gerada_em,procuracao_assinada_em').eq('id', casoId).maybeSingle()
  if (casoError || !caso) throw new Error(casoError ? `Erro ao carregar procuração: ${casoError.message}` : 'Caso não encontrado.')
  assertCarteiraPermitida(scope, caso.carteira_id)
  if (caso.etapa !== 'aguardando_sindico') throw new Error('Este caso não está na etapa de Procuração.')
  const agora = new Date().toISOString()
  const payload: Record<string, unknown> = { procuracao_status: status, observacoes, responsavel_id: user.id }
  if (status === 'gerada' && !caso.procuracao_gerada_em) payload.procuracao_gerada_em = agora
  if (status === 'assinada') { payload.procuracao_gerada_em = caso.procuracao_gerada_em ?? agora; payload.procuracao_assinada_em = caso.procuracao_assinada_em ?? agora; payload.etapa = 'confirmar_juridico' }
  const { error } = await supabase.from('pre_juridico_casos').update(payload).eq('id', casoId)
  if (error) throw new Error(`Erro ao atualizar procuração: ${error.message}`)
  revalidatePath('/app/pre-juridico/processamento')
}

export async function encaminharCobrancasPreJuridico(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const supabase = await createClient()
  const ids = Array.from(new Set(formData.getAll('cobranca_id').map(String).map((id) => id.trim()).filter(Boolean)))
  if (ids.length === 0) throw new Error('Selecione ao menos uma cobrança.')

  const elegiveis = (await listPreJuridicoCobrancas(scope)).filter((row: any) => row.situacao_pre_juridico === 'elegivel' && ids.includes(row.id))
  if (elegiveis.length !== ids.length) throw new Error('Uma ou mais cobranças não estão elegíveis para o pré-jurídico.')

  const { error: updateError } = await supabase
    .from('cobrancas')
    .update({ status: 'pre_juridico', status_operacional: 'pre_juridico' })
    .in('id', ids)
  if (updateError) throw new Error(`Erro ao encaminhar cobranças: ${updateError.message}`)

  for (const row of elegiveis as any[]) {
    await registrarEventoOperacional(supabase as any, {
      carteiraId: row.carteira_id,
      entidadeTipo: 'cobranca',
      entidadeId: row.id,
      eventoCodigo: 'cobranca.pre_juridico.encaminhada',
      titulo: 'Cobrança encaminhada ao pré-jurídico',
      descricao: `Cobrança vencida há ${row.dias_atraso} dias; regra D+${row.prazo_total}.`,
      severidade: 'alerta',
      payload: { cobranca_id: row.id, condominio_id: row.condominio_id, unidade_id: row.unidade_id },
      antes: { status_operacional: row.status_operacional ?? row.status ?? null },
      depois: { status_operacional: 'pre_juridico' },
      origem: 'manual',
      auditavel: true,
      required: true,
      userId: user.id,
    })
  }

  revalidatePath('/app/pre-juridico')
  revalidatePath('/app/pre-juridico/processamento')
  revalidatePath('/app/pre-juridico/monitor')
}

export async function gerarLaudosPreJuridico(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const supabase = await createClient()
  const ids = Array.from(new Set(formData.getAll('cobranca_id').map(String).map((id) => id.trim()).filter(Boolean)))
  if (ids.length === 0) throw new Error('Selecione ao menos uma cobrança para gerar o laudo.')

  const encaminhadas = (await listPreJuridicoCobrancas(scope))
    .filter((row: any) => row.situacao_pre_juridico === 'encaminhado' && ids.includes(row.id))
  if (encaminhadas.length !== ids.length) throw new Error('Uma ou mais cobranças não estão encaminhadas ao pré-jurídico.')

  const { data: existentes, error: existentesError } = await supabase
    .from('pre_juridico_casos')
    .select('cobranca_id')
    .in('cobranca_id', ids)
  if (existentesError) throw new Error(`Erro ao conferir processamentos existentes: ${existentesError.message}`)
  const existentesIds = new Set((existentes ?? []).map((row: any) => row.cobranca_id))
  const novos = encaminhadas.filter((row: any) => !existentesIds.has(row.id)).map((row: any) => ({
    carteira_id: row.carteira_id,
    acordo_id: null,
    condominio_id: row.condominio_id,
    unidade_id: row.unidade_id,
    cobranca_id: row.id,
    responsavel_id: user.id,
    etapa: 'aguardando_documentos',
  }))
  if (novos.length === 0) throw new Error('As cobranças selecionadas já possuem laudo gerado ou processamento iniciado.')
  const { error } = await supabase.from('pre_juridico_casos').insert(novos)
  if (error) throw new Error(`Erro ao registrar a geração dos laudos: ${error.message}`)

  for (const row of novos) {
    await registrarEventoOperacional(supabase as any, {
      carteiraId: row.carteira_id,
      entidadeTipo: 'cobranca',
      entidadeId: row.cobranca_id,
      eventoCodigo: 'cobranca.pre_juridico.laudo_gerado',
      titulo: 'Laudo pré-jurídico gerado',
      descricao: 'Laudo preparado a partir da cobrança e do histórico extrajudicial da unidade.',
      severidade: 'info',
      payload: { cobranca_id: row.cobranca_id, condominio_id: row.condominio_id, unidade_id: row.unidade_id },
      origem: 'manual',
      auditavel: true,
      required: true,
      userId: user.id,
    })
  }

  revalidatePath('/app/pre-juridico')
  revalidatePath('/app/pre-juridico/processamento')
  revalidatePath('/app/pre-juridico/monitor')
  redirect(`/app/pre-juridico/processamento/laudos?ids=${encodeURIComponent(ids.join(','))}`)
}
