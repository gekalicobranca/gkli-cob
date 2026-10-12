import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { carregarCaso, registrarCasoKeila, salvarCaso } from './casos-service'
import { validarLinkWebmail } from './webmail'

const referenciaOutlook = z.object({
  conta: z.email(), conversation_id: z.string().min(1).max(1000),
  message_id: z.string().min(1).max(1000), internet_message_id: z.string().max(1000).optional(),
  url: z.url(),
})
export const registroKeilaSchema = z.object({
  versao: z.literal(1), condominio_id: z.uuid(), unidade_ids: z.array(z.uuid()).min(1),
  titulo: z.string().min(1).max(200), intencao: z.enum(['debitos', 'parcelamento', 'outro']),
  email: z.object({ nome: z.string().max(200), remetente: z.email(), recebido_em: z.iso.datetime(),
    assunto: z.string().min(1).max(1000), resumo: z.string().min(1).max(10000), outlook: referenciaOutlook }),
  eventos: z.array(z.object({ id: z.string().min(1).max(200), em: z.iso.datetime(),
    tipo: z.enum(['retorno_recebido', 'consulta_remota', 'debitos_conferidos', 'proposta_preparada', 'rascunho_preparado']),
    resumo: z.string().min(1).max(4000), dados: z.record(z.string(), z.json()).default({}),
  })).min(1),
  proxima_acao: z.string().min(1).max(1000), resposta_rascunho: z.string().max(10000).optional(),
  execucao_id: z.uuid().optional(),
})
export type RegistroKeilaJSON = z.infer<typeof registroKeilaSchema>

function jsonCanonico(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(jsonCanonico).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${jsonCanonico(value[k])}`).join(',')}}`
  return JSON.stringify(value)
}

export function novosEventosRegistro(anteriores: RegistroKeilaJSON['eventos'], recebidos: RegistroKeilaJSON['eventos']) {
  const vistos = new Map(anteriores.map(e => [e.id, e]))
  return recebidos.filter(evento => {
    const anterior = vistos.get(evento.id)
    if (anterior && jsonCanonico(anterior) !== jsonCanonico(evento)) throw new Error('Identificador de evento já usado com outro conteúdo.')
    vistos.set(evento.id, evento)
    return !anterior
  })
}

/** Entrada de operador confiável: CLI no servidor, nunca credenciais administrativas no navegador. */
export async function registrarKeilaJSON(db: SupabaseClient, value: unknown, contexto: { carteiraIds: string[]; usuarioId: string | null }) {
  const registro = registroKeilaSchema.parse(value)
  if (registro.email.outlook.conta.toLowerCase() !== 'keila@gekali.com.br') throw new Error('Use a caixa da Keila.')
  const link = validarLinkWebmail(registro.email.outlook.url)!
  const email = { chave: `outlook:${registro.email.outlook.conta.toLowerCase()}:${registro.email.outlook.message_id}`,
    nome: registro.email.nome, remetente: registro.email.remetente, recebido_em: registro.email.recebido_em,
    assunto: registro.email.assunto, resumo: registro.email.resumo, webmail_url: link }
  const { data: condominio, error: condoError } = await db.from('condominios').select('id,carteira_id').eq('id', registro.condominio_id).single()
  if (condoError || !condominio || !contexto.carteiraIds.includes(condominio.carteira_id)) throw new Error('Condomínio fora das carteiras permitidas.')
  // Reutiliza também casos originados por flows, cujo ID segue outra regra.
  const { data: candidatos, error: buscaError } = await db.from('central_pendencias').select('id,payload')
    .eq('tipo', 'keila_atendimento').eq('condominio_id', registro.condominio_id).eq('carteira_id', condominio.carteira_id)
    .contains('payload', { unidade_ids: [...new Set(registro.unidade_ids)].sort() })
  if (buscaError) throw new Error(buscaError.message)
  const correspondentes = (candidatos ?? []).filter(c =>
    c.payload?.unidade_ids?.length === new Set(registro.unidade_ids).size || c.payload?.emails?.some(e => e.chave === email.chave))
  if (correspondentes.length > 1) throw new Error('Há mais de um atendimento para estas cobranças. Concilie antes de registrar.')
  let id = correspondentes[0]?.id
  if (!id) id = await registrarCasoKeila(db, { condominioId: registro.condominio_id, unidadeIds: registro.unidade_ids,
    referencia: email.chave,
    titulo: registro.titulo, intencao: registro.intencao, emails: [email], proximaAcao: registro.proxima_acao,
    carteiraIds: contexto.carteiraIds, usuarioId: contexto.usuarioId })
  const caso = await carregarCaso(db, id, contexto.carteiraIds)
  const anteriores = caso.payload.registro_json?.eventos ?? []
  const novos = novosEventosRegistro(anteriores, registro.eventos)
  if (!novos.length) return { casoId: id, eventosNovos: 0 }
  if (['atendimento_humano', 'concluido'].includes(caso.payload.estado)) throw new Error('Caso sob atendimento humano ou concluído; não abrir tratativa paralela.')
  if (registro.execucao_id) {
    const { data: execucao, error } = await db.from('agente_execucoes').select('id,status').eq('id', registro.execucao_id)
      .eq('condominio_id', caso.condominio_id).eq('carteira_id', caso.carteira_id).single()
    if (error || !execucao) throw new Error('Execução fora do atendimento.')
    if (registro.eventos.some(e => ['debitos_conferidos', 'proposta_preparada'].includes(e.tipo)) && execucao.status !== 'sucesso') throw new Error('Coleta remota ainda não concluída.')
  }
  const vinculo = { ...registro.email.outlook, interlocutor: registro.email.nome }
  const acompanhamento = caso.payload.acompanhamento ?? { conversas: [], pendencias: [] }
  await salvarCaso(db, caso, { ...caso.payload,
    emails: caso.payload.emails.some(e => e.chave === email.chave) ? caso.payload.emails : [...caso.payload.emails, email],
    estado: registro.eventos.some(e => e.tipo === 'proposta_preparada') ? 'proposta_preparada' : caso.payload.estado,
    proxima_acao: registro.proxima_acao,
    ...(registro.execucao_id ? { execucao_id: registro.execucao_id } : {}),
    ...(registro.resposta_rascunho !== undefined ? { resposta_simulada: registro.resposta_rascunho } : {}),
    registro_json: { versao: 1, eventos: [...anteriores, ...novos] },
    acompanhamento: { ...acompanhamento, conversas: acompanhamento.conversas.some(c => c.conta === vinculo.conta && c.message_id === vinculo.message_id)
      ? acompanhamento.conversas : [...acompanhamento.conversas, vinculo] },
    atividades: [...caso.payload.atividades, ...novos.map(e => ({ em: e.em, descricao: `${e.tipo}: ${e.resumo}`, usuario_id: contexto.usuarioId }))],
    envio_permitido: false, modo: 'supervisionado',
  }, contexto.usuarioId)
  return { casoId: id, eventosNovos: novos.length }
}
