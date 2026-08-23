'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/utils/auth/require-role'
import { requireUser } from '@/utils/auth/require-user'
import { getPermittedCarteiras, type CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { createClient } from '@/utils/supabase/server'
import { PRE_JURIDICO_ETAPAS, type PreJuridicoEtapa } from './etapas'

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
