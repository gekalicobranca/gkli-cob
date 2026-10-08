// Rotina compartilhada; wrappers autenticados fixam o agente.
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/utils/auth/require-role'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'
import { carregarCaso, salvarCaso } from '../keila/casos-service'
import { acompanhamento, avancarPrazo, cobrancaSimulada, correspondeConversa, TIPOS_PENDENCIA, validarPrazo } from '../keila/acompanhamento'
import { AGENTES_VIRTUAIS, escopoLidia, formatarEmailAgente, type AgenteVirtualId } from './perfis'

function campo(form: FormData, key: string, max = 1000) {
  const value = String(form.get(key) ?? '').trim()
  if (value.length > max) throw new Error(`Campo ${key} muito longo.`)
  return value
}
export async function salvarAcompanhamentoVirtual(agenteId: AgenteVirtualId, form: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const scope = await getPermittedCarteiras()
  const agente = AGENTES_VIRTUAIS[agenteId]
  const carteiraIds = agenteId === 'lidia' ? escopoLidia(scope.carteiraIds) : scope.carteiraIds
  const id = campo(form, 'id')
  let erro = ''
  try {
    if (carteiraIds?.length === 0) throw new Error('Sem acesso à carteira do agente.')
    const db = createAdminClient()
    const caso = await carregarCaso(db, id, carteiraIds, agenteId)
    if (caso.payload.estado === 'concluido') throw new Error('Caso encerrado.')
    const dados = structuredClone(acompanhamento(caso.payload))
    const operacao = campo(form, 'operacao')
    let estado = caso.payload.estado
    const em = new Date().toISOString()
    let descricao = ''
    if (operacao === 'vincular') {
      const conta = campo(form, 'conta').toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(conta)) throw new Error('Conta Outlook inválida.')
      const vinculo = { conta, conversation_id: campo(form, 'conversation_id'), message_id: campo(form, 'message_id'),
        internet_message_id: campo(form, 'internet_message_id'), acordo_id: campo(form, 'acordo_id'), interlocutor: campo(form, 'interlocutor') }
      if (!vinculo.conversation_id || !vinculo.message_id || !vinculo.interlocutor) throw new Error('Informe conversa, mensagem e interlocutor.')
      if (vinculo.acordo_id && !caso.payload.acordos?.some(a => a.id === vinculo.acordo_id)) throw new Error('Acordo fora do caso.')
      const existente = dados.conversas.find(v => correspondeConversa(v, vinculo))
      if (existente && existente.acordo_id !== vinculo.acordo_id) throw new Error('Conversa já vinculada a outro acordo neste caso.')
      if (!dados.conversas.some(v => correspondeConversa(v, vinculo) && v.message_id === vinculo.message_id)) dados.conversas.push(vinculo)
      descricao = `Mensagem do Outlook vinculada: ${vinculo.interlocutor} (${conta}).`
    } else if (operacao === 'pendencia') {
      const tipo = campo(form, 'tipo') as keyof typeof TIPOS_PENDENCIA
      const intervalo = Number(campo(form, 'intervalo_dias'))
      const prazo = validarPrazo(campo(form, 'prazo'))
      if (!Object.hasOwn(TIPOS_PENDENCIA, tipo) || !Number.isInteger(intervalo) || intervalo < 1 || intervalo > 365) throw new Error('Tipo ou intervalo inválido.')
      const aguardando = campo(form, 'aguardando'), proxima = campo(form, 'proxima_acao')
      const acordo = campo(form, 'acordo_id')
      if (!aguardando || !proxima) throw new Error('Informe quem deve retornar e a próxima ação.')
      if (acordo && !caso.payload.acordos?.some(a => a.id === acordo)) throw new Error('Acordo fora do caso.')
      dados.pendencias.push({ id: randomUUID(), tipo, aguardando, criada_em: em, prazo, intervalo_dias: intervalo, proxima_acao: proxima, acordo_id: acordo, simulacoes: [] })
      descricao = `Pendência aberta: ${TIPOS_PENDENCIA[tipo]}, aguardando ${aguardando}, prazo ${prazo}.`
    } else if (operacao === 'resolver' || operacao === 'simular') {
      const p = dados.pendencias.find(p => p.id === campo(form, 'pendencia_id'))
      if (!p || p.resolvida_em) throw new Error('Pendência aberta não encontrada.')
      if (operacao === 'resolver') {
        const evidencia = campo(form, 'evidencia', 4000)
        if (!evidencia) throw new Error('Registre o retorno que resolveu a pendência.')
        p.resolvida_em = em; p.evidencia = evidencia
        descricao = `Pendência resolvida: ${TIPOS_PENDENCIA[p.tipo]}. Evidência: ${evidencia}`
      } else {
        const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
        const texto = formatarEmailAgente(agenteId, campo(form, 'nome'), cobrancaSimulada(caso.payload, p, hoje))
        p.simulacoes.push({ em, texto }); p.prazo = avancarPrazo(p.prazo, p.intervalo_dias, hoje)
        descricao = `Cobrança simulada de ${TIPOS_PENDENCIA[p.tipo]}. Nenhum e-mail enviado. Próximo acompanhamento: ${p.prazo}.`
      }
    } else if (operacao === 'assumir') {
      estado = 'atendimento_humano'
      descricao = `Agente humano assumiu o caso. Réguas de ${agente.nome} suspensas.`
    } else throw new Error('Operação inválida.')
    await salvarCaso(db, caso, { ...caso.payload, estado, acompanhamento: dados,
      atividades: [...caso.payload.atividades, { em, descricao, usuario_id: scope.userId }] }, scope.userId)
  } catch (e) { erro = e instanceof Error ? e.message : 'Falha no acompanhamento.' }
  revalidatePath(agente.caminho); revalidatePath('/app/pendencias')
  redirect(`${agente.caminho}?${new URLSearchParams({ caso: id, ...(erro ? { erro } : { resultado: 'Acompanhamento atualizado. Nenhum e-mail enviado.' }) })}`)
}
