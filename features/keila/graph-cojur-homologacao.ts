import type { SupabaseClient } from '@supabase/supabase-js'
import { importarRetornosGraph } from './graph-sync'
import { abrirMicrosoftGraph } from './microsoft-graph'
import { SAFIRA_PILOTO_ID } from './webmail'

const carteira = 'e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'
const referencia = '63004'
const workflow = 'gekalicobranca/gkli-cob/.github/workflows/keila-safira-cojur.yml@refs/heads/codex/keila-safira-nuvem'
const entradaId = 'graph-safira-homologacao-entrada-v1'
const titulo = '[HOMOLOGAÇÃO COJUR] Safira — e-mail da Keila'
const assuntoTeste = '[Homologação] Safira 200043'
const assuntoControlado = /^(?:(?:enc|fw|fwd|re|res)\s*:\s*)*\[?homologacao\]?\s*[-:]?\s*safira\s+200043$/i

export async function homologarEntradaGraph(
  db: SupabaseClient, graph: Awaited<ReturnType<typeof abrirMicrosoftGraph>>,
  casoId: string, desde: string, signal: AbortSignal, remetenteControlado?: string,
) {
  const lerCaso = () => db.from('central_pendencias').select('id,titulo,payload')
    .eq('id', casoId).eq('tipo', 'keila_atendimento').eq('carteira_id', carteira)
    .eq('condominio_id', SAFIRA_PILOTO_ID).abortSignal(signal).maybeSingle()

  async function conferirRepeticao(caso: { id: string; titulo: string; payload: {
    registro_json?: { eventos?: { id: string; dados?: { graph_message_id?: string } }[] }
  } }) {
    const id = caso.payload.registro_json?.eventos?.find(evento => evento.id === entradaId)?.dados?.graph_message_id
    if (caso.titulo !== titulo || !id || !await graph.conferirMensagem(id)) throw new Error('Evidência do Graph não confirmada.')
    return { casoId: caso.id, registrados: 0, repetido: true }
  }

  const { data: existente, error: erroExistente } = await lerCaso()
  if (erroExistente) throw new Error('Não foi possível conferir o atendimento de homologação.')
  if (existente) return conferirRepeticao(existente)

  const { data: condominio, error: erroCondominio } = await db.from('condominios')
    .select('operacao_virtual_habilitada,keila_retornos_desde').eq('id', SAFIRA_PILOTO_ID)
    .eq('carteira_id', carteira).abortSignal(signal).maybeSingle()
  if (erroCondominio || !condominio?.operacao_virtual_habilitada || !condominio.keila_retornos_desde) {
    throw new Error('Safira indisponível para homologação.')
  }
  const desdePiloto = new Date(Math.max(Date.parse(desde), Date.parse(condominio.keila_retornos_desde),
    remetenteControlado ? Date.now() - 24 * 60 * 60_000 : 0)).toISOString()
  const unidades = new Map<string, { id: string; identificacao: string }>()
  let inserido = false
  let concorrente = false
  let examinados = 0
  let vinculados = 0
  const importar = (itens: unknown[], usarRemetente: boolean) => importarRetornosGraph({
    itens, desde: desdePiloto, signal,
    aceitarAssunto: remetenteControlado
      ? assunto => assuntoControlado.test(assunto.normalize('NFD').replace(/\p{M}/gu, ''))
      : usarRemetente ? () => true : undefined,
    corpoUnico: graph.corpoUnico,
    async jaRegistrado() { return inserido || concorrente },
    async identificar(remetente) {
      examinados++
      if (remetenteControlado ? remetente !== remetenteControlado : /[%_*\\]/.test(remetente)) return false
      const busca = db.from('unidades').select('id,identificacao,condominio_id,carteira_id,acao_judicial')
      if (remetenteControlado) busca.eq('identificacao', '200043').eq('condominio_id', SAFIRA_PILOTO_ID).eq('carteira_id', carteira)
      else busca.ilike('email', remetente)
      const { data, error } = await busca.limit(2).abortSignal(signal)
      if (error) throw new Error('Não foi possível conferir o remetente do Graph.')
      const unidade = data?.[0]
      if (data?.length !== 1 || unidade.condominio_id !== SAFIRA_PILOTO_ID || unidade.carteira_id !== carteira ||
          unidade.acao_judicial || !/^\d{6}$/.test(unidade.identificacao)) return false
      const acordo = await db.from('acordos').select('id').eq('condominio_id', SAFIRA_PILOTO_ID)
        .eq('unidade_id', unidade.id).limit(1).abortSignal(signal).maybeSingle()
      if (acordo.error) throw new Error('Não foi possível conferir o histórico da unidade.')
      if (acordo.data) return false
      unidades.set(remetente, unidade)
      vinculados++
      return true
    },
    async registrar(retorno) {
      const unidade = unidades.get(retorno.p_remetente)
      if (!unidade || (!remetenteControlado && (retorno.p_revisao || retorno.p_intencao === 'outro'))) return
      const em = new Date().toISOString()
      const descricao = 'E-mail do Safira recebido pelo Graph. Consulta COJUR de homologação solicitada.'
      // A referência ao e-mail fica na evidência. Não há destinatário disponível para envio.
      const { data, error } = await db.from('central_pendencias').upsert({
        id: casoId, carteira_id: carteira, condominio_id: SAFIRA_PILOTO_ID, unidade_id: unidade.id,
        tipo: 'keila_atendimento', origem: 'mensageria', status: 'em_tratamento', prioridade: 'normal',
        titulo, descricao, entidade_tipo: 'condominio', entidade_id: SAFIRA_PILOTO_ID,
        payload: {
          versao: 1, modo: 'supervisionado', estado: 'buscando_debitos',
          intencao: remetenteControlado ? 'debitos' : retorno.p_intencao,
          envio_permitido: false, unidade_ids: [unidade.id], emails: [], proxima_acao: descricao,
          atividades: [{ em, descricao }],
          registro_json: { versao: 1, eventos: [
            { id: entradaId, tipo: 'retorno_recebido', em, resumo: 'E-mail de homologação lido na caixa da Keila.',
              dados: { graph_message_id: retorno.p_message_id, recebido_em: retorno.p_recebido_em, outlook_url: retorno.p_url } },
            { id: 'cojur-safira-homologacao-pedido-v1', tipo: 'consulta_remota', em, resumo: descricao,
              dados: { referencia, unidade: unidade.identificacao, workflow_ref: workflow,
                expira_em: new Date(Date.parse(em) + 3 * 60 * 60_000).toISOString() } },
          ] },
        },
      }, { onConflict: 'id', ignoreDuplicates: true }).select('id,payload').abortSignal(signal).maybeSingle()
      if (error) throw new Error('Não foi possível registrar a mensagem de homologação.')
      if (!data) { concorrente = true; return }
      if (data.payload.estado !== 'buscando_debitos') throw new Error('Caso protegido para revisão humana.')
      inserido = true
    },
  })
  const itens = remetenteControlado
    ? await graph.localizarMensagemHomologacao(desdePiloto, { remetente: remetenteControlado })
    : (await Promise.all([
      graph.recentes(desdePiloto, 'inbox', true), graph.recentes(desdePiloto, 'archive', true),
    ])).flat()
  await importar(itens, false)
  const encontradosPorAssunto = remetenteControlado && !inserido && !concorrente
    ? await graph.localizarMensagemHomologacao(desdePiloto, { assunto: assuntoTeste }) : []
  await importar(encontradosPorAssunto, false)
  if (!remetenteControlado && !inserido && !concorrente) {
    // No segundo recorte, o vínculo único com a unidade confirma o Safira
    // mesmo quando o assunto do e-mail não menciona o condomínio.
    await importar(await graph.recentes(desdePiloto, 'inbox', false), true)
  }
  if (concorrente) {
    const { data, error } = await lerCaso()
    if (error || !data) throw new Error('Registro concorrente não confirmado.')
    return conferirRepeticao(data)
  }
  return { casoId: inserido ? casoId : null, registrados: inserido ? 1 : 0, repetido: false,
    ...(inserido ? {} : { itensEncontrados: itens.length, encontradosPorAssunto: encontradosPorAssunto.length, examinados, vinculados }) }
}
