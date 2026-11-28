import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { importarRetornosGraph } from './graph-sync'
import type { abrirMicrosoftGraph } from './microsoft-graph'
import { SAFIRA_PILOTO_ID } from './webmail'

const carteira = 'e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'
const referencia = '63004'
const workflow = 'gekalicobranca/gkli-cob/.github/workflows/keila-safira-cojur.yml@refs/heads/codex/keila-safira-nuvem'
const lote = 'safira-reais-homologacao-20261128'
const entradaId = 'graph-safira-homologacao-entrada-v1'
const limite = 10
const titulo = '[HOMOLOGAÇÃO COJUR] Safira — teste com e-mail recebido'
type Unidade = { id: string; identificacao: string; email: string | null; acao_judicial: boolean }
type Retorno = Parameters<Parameters<typeof importarRetornosGraph>[0]['registrar']>[0]
type Candidato = { retorno: Retorno; unidade: Unidade; revisao: string }

function idAtendimento(messageId: string) {
  const hash = createHash('sha256').update(lote + ':' + messageId).digest('hex')
  return [hash.slice(0,8), hash.slice(8,12), '4' + hash.slice(13,16), '8' + hash.slice(17,20), hash.slice(20,32)].join('-')
}

export async function homologarLoteSafira(
  db: SupabaseClient, graph: Awaited<ReturnType<typeof abrirMicrosoftGraph>>, signal: AbortSignal, gravar: boolean,
) {
  const lerLote = () => db.from('central_pendencias').select('id,payload')
    .eq('tipo','keila_atendimento').eq('titulo',titulo).eq('condominio_id',SAFIRA_PILOTO_ID)
    .eq('carteira_id',carteira).contains('payload',{ homologacao_lote: lote }).abortSignal(signal)
  const { data: existentes, error: erroExistentes } = await lerLote()
  if (erroExistentes) throw new Error('Lote de homologação indisponível.')
  if (existentes?.length) {
    const verificados = await Promise.all(existentes.map(async caso => {
      const eventos = caso.payload.registro_json.eventos
      const mensagem = eventos.find(e => e.id === entradaId)?.dados.graph_message_id
      const unidade = eventos.find(e => e.id === 'cojur-safira-homologacao-pedido-v1')?.dados.unidade
      if (!mensagem || !unidade || !await graph.conferirMensagem(mensagem)) throw new Error('Entrada do lote não confirmada no Graph.')
      return { casoId: caso.id, unidade }
    }))
    return { registrados: 0, reaproveitados: verificados.length, atendimentos: verificados }
  }

  const { data: condominio, error: erroCondominio } = await db.from('condominios')
    .select('keila_retornos_desde,operacao_virtual_habilitada').eq('id',SAFIRA_PILOTO_ID)
    .eq('carteira_id',carteira).abortSignal(signal).maybeSingle()
  if (erroCondominio || !condominio?.keila_retornos_desde || !condominio.operacao_virtual_habilitada) {
    throw new Error('Piloto do Safira indisponível.')
  }
  const desde = new Date(Math.max(Date.parse(condominio.keila_retornos_desde), Date.now() - 90 * 86_400_000)).toISOString()
  const [lista, { data: unidades, error: erroUnidades }] = await Promise.all([
    graph.conversasSafira(desde),
    db.from('unidades').select('id,identificacao,email,acao_judicial')
      .eq('condominio_id',SAFIRA_PILOTO_ID).eq('carteira_id',carteira).limit(1000).abortSignal(signal),
  ])
  if (erroUnidades) throw new Error('Unidades do Safira indisponíveis.')
  const porEmail = new Map<string, Unidade[]>()
  for (const unidade of unidades ?? []) {
    if (!unidade.email) continue
    const email = unidade.email.trim().toLowerCase()
    porEmail.set(email, [...(porEmail.get(email) ?? []), unidade])
  }
  const candidatos: Candidato[] = []
  const vistos = new Set<string>()
  const vinculosConferidos = new Map<string, { valido: boolean; acordo: boolean }>()
  const motivo = { semContato: 0, acordo: 0, revisao: 0, duplicado: 0 }
  await importarRetornosGraph({
    itens: lista.itens, desde, signal,
    corpoUnico: graph.corpoUnico,
    async jaRegistrado(id) {
      if (vistos.has(id)) return true
      vistos.add(id)
      return false
    },
    async identificar(remetente) {
      const [unidade] = porEmail.get(remetente) ?? []
      return (porEmail.get(remetente)?.length === 1) && !!unidade && !unidade.acao_judicial &&
        /^\d{6}$/.test(unidade.identificacao)
    },
    async registrar(retorno) {
      const [unidade] = porEmail.get(retorno.p_remetente) ?? []
      if (!unidade || porEmail.get(retorno.p_remetente)?.length !== 1 || unidade.acao_judicial ||
          !/^\d{6}$/.test(unidade.identificacao) || /[%_*\\]/.test(retorno.p_remetente)) {
        motivo.semContato++
        return
      }
      let conferido = vinculosConferidos.get(retorno.p_remetente)
      if (!conferido) {
        const [vinculos, acordos] = await Promise.all([
          db.from('unidades').select('id').ilike('email', retorno.p_remetente).limit(2).abortSignal(signal),
          db.from('acordos').select('id').eq('condominio_id', SAFIRA_PILOTO_ID)
            .eq('unidade_id', unidade.id).limit(1).abortSignal(signal),
        ])
        if (vinculos.error || acordos.error) throw new Error('Vínculo ou histórico do lote indisponível.')
        conferido = { valido: vinculos.data?.length === 1 && vinculos.data[0].id === unidade.id, acordo: !!acordos.data?.length }
        vinculosConferidos.set(retorno.p_remetente, conferido)
      }
      if (!conferido.valido) {
        motivo.semContato++
        return
      }
      const revisao = conferido.acordo ? 'acordo' : retorno.p_revisao
      if (conferido.acordo) motivo.acordo++
      else if (revisao) motivo.revisao++
      candidatos.push({ retorno, unidade, revisao })
    },
  })
  const aceitos: Candidato[] = []
  const conversas = new Set<string>()
  const selecionadas = new Set<string>()
  for (const candidato of candidatos.sort((a,b) => Number(!!a.revisao) - Number(!!b.revisao))) {
    if (conversas.has(candidato.retorno.p_conversation_id) || selecionadas.has(candidato.unidade.id)) {
      motivo.duplicado++
      continue
    }
    aceitos.push(candidato)
    conversas.add(candidato.retorno.p_conversation_id)
    selecionadas.add(candidato.unidade.id)
    if (aceitos.length === limite) break
  }
  if (!gravar || !aceitos.length) return {
    pesquisados: lista.itens.length, elegiveis: aceitos.length, maisMensagens: lista.temMais, motivos: motivo,
    amostra: aceitos.map(({ unidade, revisao }) => ({ unidade: unidade.identificacao, revisao })),
  }

  const em = new Date().toISOString()
  const descricao = 'E-mail real do Safira lido no Graph. Consulta de homologação da Lello solicitada.'
  const registros = aceitos.map(({ retorno, unidade, revisao }) => ({
    id: idAtendimento(retorno.p_message_id), carteira_id: carteira, condominio_id: SAFIRA_PILOTO_ID, unidade_id: unidade.id,
    tipo: 'keila_atendimento', origem: 'mensageria', status: 'em_tratamento', prioridade: 'normal',
    titulo, descricao, entidade_tipo: 'condominio', entidade_id: SAFIRA_PILOTO_ID,
    payload: {
      versao: 1, modo: 'supervisionado', estado: revisao ? 'atendimento_humano' : 'buscando_debitos', intencao: retorno.p_intencao,
      envio_permitido: false, unidade_ids: [unidade.id], emails: [], proxima_acao: descricao,
      homologacao_lote: lote, homologacao_revisao: revisao, atividades: [{ em, descricao }],
      registro_json: { versao: 1, eventos: [
        { id: entradaId, tipo: 'retorno_recebido', em, resumo: 'E-mail real lido na caixa da Keila.',
          dados: { graph_message_id: retorno.p_message_id, recebido_em: retorno.p_recebido_em, outlook_url: retorno.p_url } },
        { id: 'cojur-safira-homologacao-pedido-v1', tipo: 'consulta_remota', em, resumo: descricao,
          dados: { referencia, unidade: unidade.identificacao, workflow_ref: workflow,
            expira_em: new Date(Date.parse(em) + 3 * 60 * 60_000).toISOString() } },
      ] },
    },
  }))
  const { data, error } = await db.from('central_pendencias').upsert(registros,{ onConflict:'id', ignoreDuplicates:true })
    .select('id,payload').abortSignal(signal)
  if (error || !data || data.some(caso => !['buscando_debitos','atendimento_humano'].includes(caso.payload.estado))) {
    throw new Error('Registro do lote exige conferência.')
  }
  return { registrados: data.length, elegiveis: aceitos.length, motivos: motivo,
    atendimentos: registros.map((r, i) => ({ casoId: r.id, unidade: aceitos[i].unidade.identificacao })) }
}
