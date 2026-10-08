import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { enfileirarColetaReceita } from '../agente-automatico/execucoes-service'
import { registrarEventoOperacional } from '../operacional/service'
import { lerCasoPayload, unirEmails, type KeilaCasoPayload, type KeilaEmail, type KeilaEstado } from './casos'
import { AGENTES_VIRTUAIS, validarCondominioLidia, type AgenteVirtualId } from '../agentes-virtuais/perfis'

export function casoId(condominioId: string, unidadeIds: string[], referencia = '', agenteId: AgenteVirtualId = 'keila') {
  const hash = createHash('sha256').update([AGENTES_VIRTUAIS[agenteId].tipoCaso, condominioId, [...new Set(unidadeIds)].sort().join(','), referencia].join(':')).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

export async function carregarCaso(supabase: SupabaseClient, id: string, carteiraIds: string[] | null, agenteId: AgenteVirtualId = 'keila') {
  let query = supabase.from('central_pendencias').select('*').eq('id', id).eq('tipo', AGENTES_VIRTUAIS[agenteId].tipoCaso)
  if (carteiraIds !== null) query = query.in('carteira_id', carteiraIds)
  const { data, error } = await query.single()
  if (error || !data) throw new Error(error?.message ?? 'Caso não encontrado nas carteiras permitidas.')
  if (agenteId === 'lidia') validarCondominioLidia({ id: data.condominio_id, carteira_id: data.carteira_id })
  const payload = lerCasoPayload(data.payload)
  if (!payload) throw new Error('Dados do atendimento inválidos.')
  return { ...data, payload: { ...payload, ...(['resolvida', 'cancelada'].includes(data.status) ? { estado: 'concluido' as const } : {}) } }
}

export async function salvarCaso(supabase: SupabaseClient, caso: Awaited<ReturnType<typeof carregarCaso>>, payload: KeilaCasoPayload, usuarioId: string | null) {
  const status = payload.estado === 'concluido' ? 'resolvida' : 'em_tratamento'
  const { data, error } = await supabase.from('central_pendencias').update({
    payload, status, descricao: payload.proxima_acao, updated_at: new Date().toISOString(),
    resolvido_em: status === 'resolvida' ? new Date().toISOString() : null,
  }).eq('id', caso.id).eq('tipo', caso.tipo).eq('updated_at', caso.updated_at).select('id').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('O caso foi atualizado por outra pessoa. Recarregue antes de continuar.')
  const evento = await registrarEventoOperacional(supabase, {
    carteiraId: caso.carteira_id, entidadeTipo: 'condominio', entidadeId: caso.condominio_id,
    eventoCodigo: caso.tipo === AGENTES_VIRTUAIS.lidia.tipoCaso ? 'lidia.caso_atualizado' : 'keila.caso_atualizado', titulo: caso.titulo, descricao: payload.atividades.at(-1)?.descricao,
    estadoAnterior: caso.payload.estado, estadoNovo: payload.estado, origem: 'manual', userId: usuarioId,
    payload: { caso_id: caso.id, unidade_ids: payload.unidade_ids, execucao_id: payload.execucao_id ?? null, envio_permitido: false },
  })
  if (evento.error) throw new Error(`Caso salvo, mas houve falha no histórico: ${evento.error.message}`)
}

export async function registrarCasoKeila(supabase: SupabaseClient, input: {
  condominioId: string; unidadeIds: string[]; titulo: string; intencao: KeilaCasoPayload['intencao'];
  emails: KeilaEmail[]; proximaAcao: string; usuarioId: string | null; carteiraIds: string[] | null;
  referencia?: string; agenteId?: AgenteVirtualId
}) {
  const { data: condominio, error } = await supabase.from('condominios').select('id,carteira_id').eq('id', input.condominioId).single()
  if (error || !condominio) throw new Error(error?.message ?? 'Condomínio não encontrado.')
  const agenteId = input.agenteId ?? 'keila'
  const agente = AGENTES_VIRTUAIS[agenteId]
  if (agenteId === 'lidia') validarCondominioLidia(condominio)
  if (input.carteiraIds !== null && !input.carteiraIds.includes(condominio.carteira_id)) throw new Error('Condomínio fora das carteiras permitidas.')
  const unidadeIds = [...new Set(input.unidadeIds)].sort()
  if (unidadeIds.length) {
    const { data: unidades, error: unidadeError } = await supabase.from('unidades').select('id')
      .eq('condominio_id', condominio.id).in('id', unidadeIds)
    if (unidadeError || unidades?.length !== unidadeIds.length) throw new Error('Unidades não pertencem ao condomínio informado.')
  }
  if (!unidadeIds.length && !input.referencia) throw new Error('Informe as unidades ou uma referência para identificar o caso.')
  const id = casoId(condominio.id, unidadeIds, input.referencia, agenteId)
  const { data: existente, error: existenteError } = await supabase.from('central_pendencias').select('id').eq('id', id).maybeSingle()
  if (existenteError) throw new Error(existenteError.message)
  if (existente) {
    const caso = await carregarCaso(supabase, id, input.carteiraIds, agenteId)
    const emails = unirEmails(caso.payload.emails, input.emails)
    if (emails.length > caso.payload.emails.length) await salvarCaso(supabase, caso, {
      ...caso.payload, emails,
      atividades: [...caso.payload.atividades, { em: new Date().toISOString(), descricao: 'Novos e-mails associados ao atendimento existente.', usuario_id: input.usuarioId }],
    }, input.usuarioId)
    return id
  }
  const payload: KeilaCasoPayload = {
    versao: 1, estado: 'em_analise', intencao: input.intencao, unidade_ids: unidadeIds,
    emails: unirEmails([], input.emails), atividades: [{ em: new Date().toISOString(), descricao: 'Atendimento registrado para acompanhamento supervisionado, sem envio de e-mails.', usuario_id: input.usuarioId }],
    proxima_acao: input.proximaAcao, envio_permitido: false, modo: 'supervisionado',
  }
  const { error: insertError } = await supabase.from('central_pendencias').insert({
    id, carteira_id: condominio.carteira_id, condominio_id: condominio.id,
    unidade_id: unidadeIds.length === 1 ? unidadeIds[0] : null,
    origem: 'mensageria', tipo: agente.tipoCaso, status: 'em_tratamento', prioridade: 'normal',
    titulo: input.titulo, descricao: input.proximaAcao, entidade_tipo: 'condominio', entidade_id: condominio.id, payload,
  })
  if (insertError) {
    if (insertError.code === '23505') return registrarCasoKeila(supabase, input)
    throw new Error(insertError.message)
  }
  return id
}

export async function atualizarCasoKeila(supabase: SupabaseClient, input: {
  id: string; estado: KeilaEstado; descricao: string; proximaAcao: string; usuarioId: string | null;
  carteiraIds: string[] | null; respostaSimulada?: string; agenteId?: AgenteVirtualId
}) {
  const caso = await carregarCaso(supabase, input.id, input.carteiraIds, input.agenteId)
  if (caso.payload.estado === 'atendimento_humano' && !['atendimento_humano', 'concluido'].includes(input.estado)) {
    throw new Error('Caso sob prioridade humana. O agente virtual não pode abrir negociação paralela.')
  }
  await salvarCaso(supabase, caso, {
    ...caso.payload, estado: input.estado, proxima_acao: input.proximaAcao,
    ...(input.respostaSimulada !== undefined ? { resposta_simulada: input.respostaSimulada } : {}),
    atividades: [...caso.payload.atividades, { em: new Date().toISOString(), descricao: input.descricao, usuario_id: input.usuarioId }],
  }, input.usuarioId)
}

export async function buscarDebitosCasoKeila(supabase: SupabaseClient, input: {
  id: string; usuarioId: string | null; carteiraIds: string[] | null; agenteId?: AgenteVirtualId
}) {
  const caso = await carregarCaso(supabase, input.id, input.carteiraIds, input.agenteId)
  if (['atendimento_humano', 'concluido'].includes(caso.payload.estado)) throw new Error('Este caso não permite uma nova coleta pelo agente virtual.')
  if (caso.payload.execucao_id) {
    const { data: execucao, error } = await supabase.from('agente_execucoes').select('id,status')
      .eq('id', caso.payload.execucao_id).eq('condominio_id', caso.condominio_id).single()
    if (error) throw new Error(error.message)
    if (execucao && ['pendente', 'em_execucao', 'sucesso'].includes(execucao.status)) return execucao.id as string
  }
  const { data: receitas, error } = await supabase.from('agente_receitas')
    .select('id,administradora:agente_administradoras!inner(ativo)')
    .eq('config_json->>condominio_id', caso.condominio_id).eq('ativo', true).eq('administradora.ativo', true)
    .not('script_key', 'is', null).neq('script_key', '')
  if (error) throw new Error(error.message)
  if (!receitas?.length) throw new Error('Sem agente remoto cadastrado. Registre a solicitação à administradora e acompanhe a pendência.')
  if (receitas.length !== 1) throw new Error('Há mais de um agente remoto. Defina a receita correta na área de agentes.')
  const resultado = await enfileirarColetaReceita(supabase, {
    receitaId: receitas[0].id, solicitadoPor: input.usuarioId, carteiraIds: input.carteiraIds, origem: 'manual',
    execucaoId: casoId(caso.condominio_id, caso.payload.unidade_ids, `${caso.id}:coleta:${caso.payload.execucao_id ?? 'inicial'}`),
  })
  await salvarCaso(supabase, caso, {
    ...caso.payload, estado: 'buscando_debitos', execucao_id: resultado.execucaoId,
    proxima_acao: 'Acompanhar coleta, validar o relatório e conferir os débitos das unidades antes de preparar a resposta.',
    atividades: [...caso.payload.atividades, { em: new Date().toISOString(), descricao: `Coleta supervisionada ${resultado.reutilizada ? 'vinculada' : 'criada'}: ${resultado.execucaoId}.`, usuario_id: input.usuarioId }],
  }, input.usuarioId)
  return resultado.execucaoId
}
