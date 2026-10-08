// Implementação compartilhada; os pontos públicos fixam o agente no servidor.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { requireRole } from '@/utils/auth/require-role'
import { createAdminClient } from '@/utils/supabase/admin'
import { atualizarCasoKeila, buscarDebitosCasoKeila, registrarCasoKeila } from '../keila/casos-service'
import { KEILA_ESTADOS, type KeilaEstado, type KeilaCasoPayload } from '../keila/casos'
import { createClient } from '@/utils/supabase/server'
import { proporAcordoKeila, aceitarAcordoKeila } from '../keila/acordos-service'

import { AGENTES_VIRTUAIS, escopoLidia, type AgenteVirtualId } from './perfis'

function texto(form: FormData, key: string) { return String(form.get(key) ?? '').trim() }
function validarEstado(value: string): KeilaEstado {
  if (!Object.hasOwn(KEILA_ESTADOS, value)) throw new Error('Estado inválido.')
  return value as KeilaEstado
}
export async function executarAtendimentoVirtual(agenteId: AgenteVirtualId, form: FormData, operacao: 'registrar' | 'atualizar' | 'coletar') {
  await requireRole(['admin', 'gestor', 'operador'])
  const scope = await getPermittedCarteiras()
  const agente = AGENTES_VIRTUAIS[agenteId]
  const carteiraIds = agenteId === 'lidia' ? escopoLidia(scope.carteiraIds) : scope.carteiraIds
  let id = texto(form, 'id')
  let erro = ''
  try {
    if (carteiraIds?.length === 0) throw new Error('Sem acesso à carteira do agente.')
    const supabase = createAdminClient()
    const comum = { usuarioId: scope.userId, carteiraIds, agenteId }
    if (operacao === 'coletar') await buscarDebitosCasoKeila(supabase, { ...comum, id })
    if (operacao === 'atualizar') {
      const descricao = texto(form, 'descricao')
      if (!descricao || descricao.length > 4000) throw new Error('Descreva a atividade em até 4.000 caracteres.')
      await atualizarCasoKeila(supabase, { ...comum, id, estado: validarEstado(texto(form, 'estado')),
        descricao, proximaAcao: texto(form, 'proxima_acao'), respostaSimulada: texto(form, 'resposta_simulada'),
      })
    }
    if (operacao === 'registrar') {
      const intencao = texto(form, 'intencao')
      if (!['debitos', 'parcelamento', 'outro'].includes(intencao)) throw new Error('Intenção inválida.')
      const titulo = texto(form, 'titulo')
      if (!titulo || titulo.length > 200) throw new Error('Informe um título de até 200 caracteres.')
      const remetente = texto(form, 'remetente').toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(remetente)) throw new Error('Informe um e-mail válido.')
      const recebido = new Date(`${texto(form, 'recebido_em')}:00-03:00`)
      if (Number.isNaN(recebido.getTime())) throw new Error('Data de recebimento inválida.')
      const assunto = texto(form, 'assunto'), resumo = texto(form, 'resumo')
      if (!assunto || !resumo || resumo.length > 10000) throw new Error('Informe assunto e conteúdo do e-mail (até 10.000 caracteres).')
      id = await registrarCasoKeila(supabase, { ...comum, titulo, condominioId: texto(form, 'condominio_id'),
        unidadeIds: form.getAll('unidade_ids').map(String).map(s => s.trim()).filter(Boolean),
        referencia: texto(form, 'referencia'), intencao: intencao as KeilaCasoPayload['intencao'],
        proximaAcao: texto(form, 'proxima_acao'),
        emails: [{ chave: `${remetente}:${recebido.toISOString()}:${assunto}`, nome: texto(form, 'nome'),
          remetente, recebido_em: recebido.toISOString(), assunto, resumo }],
      })
    }
  } catch (error) { erro = error instanceof Error ? error.message : 'Não foi possível atualizar o atendimento.' }
  revalidatePath(agente.caminho)
  revalidatePath('/app/pendencias')
  revalidatePath('/app/agente-automatico')
  redirect(`${agente.caminho}?${new URLSearchParams({ ...(id ? { caso: id } : {}), ...(erro ? { erro } : { resultado: 'Atendimento atualizado.' }) })}`)
}

export async function negociarAtendimentoVirtual(agenteId: AgenteVirtualId, form: FormData, aceitar: boolean) {
  await requireRole(['admin', 'gestor', 'operador'])
  const scope = await getPermittedCarteiras()
  const agente = AGENTES_VIRTUAIS[agenteId]
  const carteiraIds = agenteId === 'lidia' ? escopoLidia(scope.carteiraIds) : scope.carteiraIds
  const id = texto(form, 'id')
  let erro = ''
  try {
    if (carteiraIds?.length === 0) throw new Error('Sem acesso à carteira do agente.')
    const db = await createClient()
    if (aceitar) await aceitarAcordoKeila(db, { agenteId, casoId: id, unidadeId: texto(form, 'unidade_id'), evidencia: texto(form, 'evidencia') })
    else await proporAcordoKeila(db, { casoId: id, unidadeId: texto(form, 'unidade_id'), carteiraIds, agenteId,
      parcelas: Number(texto(form, 'parcelas')), vencimento: texto(form, 'vencimento') })
  } catch (error) { erro = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? 'Falha na negociação.') }
  for (const caminho of [agente.caminho, '/app/cobrancas', '/app/acordos', '/app/pendencias']) revalidatePath(caminho)
  redirect(`${agente.caminho}?${new URLSearchParams({ caso: id, ...(erro ? { erro } : { resultado: aceitar ? 'Aceite registrado e acordo firmado. Nenhum e-mail enviado.' : 'Proposta preparada; cobranças em possível acordo.' }) })}`)
}
