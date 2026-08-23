'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/utils/auth/require-role'
import { requireUser } from '@/utils/auth/require-user'
import { getPermittedCarteiras, type CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { createClient } from '@/utils/supabase/server'
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
  revalidatePath('/app/pre-juridico/monitor')
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

  const { data: existentes, error: existentesError } = await supabase
    .from('pre_juridico_casos')
    .select('cobranca_id')
    .in('cobranca_id', ids)
  if (existentesError) throw new Error(`Erro ao conferir casos existentes: ${existentesError.message}`)
  const existentesIds = new Set((existentes ?? []).map((row: any) => row.cobranca_id))
  const novos = elegiveis.filter((row: any) => !existentesIds.has(row.id)).map((row: any) => ({
    carteira_id: row.carteira_id,
    acordo_id: null,
    condominio_id: row.condominio_id,
    unidade_id: row.unidade_id,
    cobranca_id: row.id,
    responsavel_id: user.id,
    etapa: 'aguardando_documentos',
  }))
  if (novos.length > 0) {
    const { error: casosError } = await supabase.from('pre_juridico_casos').insert(novos)
    if (casosError) throw new Error(`Erro ao criar acompanhamento pré-jurídico: ${casosError.message}`)
  }

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
  revalidatePath('/app/pre-juridico/monitor')
}
