import type { SupabaseClient } from '@supabase/supabase-js'
import { AGENTES_VIRTUAIS } from '../agentes-virtuais/perfis'
import { configGraphSchema, emailGraphSchema, abrirMicrosoftGraph } from './microsoft-graph'
import { SAFIRA_PILOTO_ID, validarLinkWebmail } from './webmail'

const CARTEIRA_GEKALI = 'e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'
const conta = AGENTES_VIRTUAIS.keila.email
const assuntoSafira = /(^|[^\p{L}\p{N}_])safira(?=$|[^\p{L}\p{N}_])/iu
const remetenteAutomatico = /^(?:mailer-daemon|postmaster|microsoftoffice365|microsoftexchange[^@]*|noreply|no-reply)@/i
const assuntoAutomatico = /^(?:undeliverable|undelivered|delivery (?:has failed|status notification)|resposta automática|automatic reply|falha na entrega|não foi possível entregar)\b/i

function classificar(corpo: string | null) {
  const texto = corpo?.slice(0, 12_000).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() ?? ''
  if (/\bboletos?\b/.test(texto)) return { intencao: 'outro', revisao: 'pedido_boleto' }
  if (/\b(paguei|pago|pagamento feito|comprovante|negociacao em andamento|ja negociei|aceito|confirmo|recebi|acordo anterior|whatsapp)\b/.test(texto)) {
    return { intencao: 'outro', revisao: 'conteudo' }
  }
  if (/\b(parcelar|parcelamento|renegociar|renegociacao|negociar)\b/.test(texto)) return { intencao: 'parcelamento', revisao: '' }
  if (/\b(cotas?|pendencias?|debitos?|parcelas?|saldo|valores?|mensalidades?)\b/.test(texto)) return { intencao: 'debitos', revisao: '' }
  return { intencao: 'outro', revisao: 'conteudo' }
}

type RetornoGraph = {
  p_message_id: string; p_conversation_id: string; p_internet_message_id: string | null
  p_remetente: string; p_recebido_em: string; p_assunto: string; p_url: string
  p_intencao: string; p_revisao: string
}

type EntradaGraph = {
  itens: unknown[]
  desde: string
  signal: AbortSignal
  aceitarAssunto?: (assunto: string) => boolean
  jaRegistrado(id: string): Promise<boolean>
  identificar(remetente: string): Promise<boolean>
  corpoUnico(id: string): Promise<string | null>
  registrar(retorno: RetornoGraph): Promise<void>
}

export async function importarRetornosGraph(entrada: EntradaGraph) {
  let registrados = 0
  const desde = Date.parse(entrada.desde)
  const limite = Date.now() + 5 * 60_000
  for (const item of entrada.itens) {
    entrada.signal.throwIfAborted()
    if (item && typeof item === 'object' && '@removed' in item) continue
    const parse = emailGraphSchema.safeParse(item)
    if (!parse.success) continue
    const m = parse.data
    const assunto = (m.subject ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 500)
    const remetente = m.from?.emailAddress.address.toLowerCase()
    const data = Date.parse(m.receivedDateTime)
    if (!remetente || remetente === conta || remetenteAutomatico.test(remetente) || assuntoAutomatico.test(assunto) ||
      m.isDraft || !(entrada.aceitarAssunto?.(assunto) ?? assuntoSafira.test(assunto)) ||
      !Number.isFinite(data) || data < desde || data > limite) continue
    let link: string
    try {
      link = validarLinkWebmail(m.webLink)
    } catch {
      continue
    }
    if (!link || await entrada.jaRegistrado(m.id)) continue
    const analise = m.hasAttachments
      ? { intencao: 'outro', revisao: 'anexo' }
      : await entrada.identificar(remetente)
        ? classificar(await entrada.corpoUnico(m.id))
        : { intencao: 'outro', revisao: 'conteudo' }
    await entrada.registrar({
      p_message_id: m.id, p_conversation_id: m.conversationId, p_internet_message_id: m.internetMessageId ?? null,
      p_remetente: remetente, p_recebido_em: new Date(data).toISOString(), p_assunto: assunto, p_url: link,
      p_intencao: analise.intencao, p_revisao: analise.revisao,
    })
    registrados++
  }
  return registrados
}

export async function sincronizarCaixaKeila(db: SupabaseClient, config: unknown, signal: AbortSignal, requisitar = fetch) {
  const credenciais = configGraphSchema.parse(config)
  const inicio = new Date(credenciais.desde).toISOString()
  if (Date.parse(inicio) > Date.now()) throw new Error('Data de ativação do Graph inválida.')
  const { data: piloto, error: erroPiloto } = await db.from('condominios')
    .select('keila_retornos_desde,operacao_virtual_habilitada')
    .eq('id', SAFIRA_PILOTO_ID).eq('carteira_id', CARTEIRA_GEKALI).abortSignal(signal).maybeSingle()
  if (erroPiloto) throw new Error('Não foi possível conferir o piloto do Safira.')
  if (!piloto?.operacao_virtual_habilitada || !piloto.keila_retornos_desde) return { registrados: 0, pausado: true }
  const inicioPiloto = new Date(piloto.keila_retornos_desde).toISOString()
  const desde = inicio > inicioPiloto ? inicio : inicioPiloto

  const { error: iniciarErro } = await db.from('keila_graph_cursor').upsert({ id: true, desde }, { onConflict: 'id', ignoreDuplicates: true })
    .abortSignal(signal)
  if (iniciarErro) throw new Error('Não foi possível inicializar o cursor do Graph.')
  const { data: checkpoint, error: cursorErro } = await db.from('keila_graph_cursor').select('desde,proxima_url,revisao')
    .eq('id', true).abortSignal(signal).single()
  if (cursorErro || !checkpoint) throw new Error('Cursor do Graph indisponível.')
  if (new Date(checkpoint.desde).toISOString() !== desde) throw new Error('Data de ativação diverge do cursor existente.')

  // Uma página por disparo. Os retornos confirmados se repetem sem escrita se
  // alguma mensagem ou o salvamento do cursor falhar no fim da página.
  const graph = await abrirMicrosoftGraph(credenciais, signal, requisitar)
  const pagina = await graph.pagina(checkpoint.proxima_url, desde)
  const registrados = await importarRetornosGraph({
    itens: pagina.itens, desde, signal,
    async jaRegistrado(id) {
      const { data, error } = await db.from('keila_graph_recebimentos').select('message_id')
        .eq('message_id', id).abortSignal(signal).maybeSingle()
      if (error) throw new Error('Não foi possível conferir a duplicidade do retorno.')
      return data !== null
    },
    async identificar(remetente) {
      const { data, error } = await db.rpc('keila_graph_unidade', { p_remetente: remetente }).abortSignal(signal)
      if (error) throw new Error('Não foi possível conferir o remetente do retorno.')
      return typeof data === 'string'
    },
    corpoUnico: graph.corpoUnico,
    async registrar(retorno) {
      const { error } = await db.rpc('keila_graph_registrar', retorno).abortSignal(signal)
      if (error) throw new Error('Não foi possível registrar o retorno do Graph.')
    },
  })
  const { data: salvo, error: salvarErro } = await db.from('keila_graph_cursor')
    .update({ proxima_url: pagina.proxima, revisao: checkpoint.revisao + 1 })
    .eq('id', true).eq('revisao', checkpoint.revisao).select('id').abortSignal(signal).maybeSingle()
  if (salvarErro) throw new Error('Não foi possível persistir o cursor do Graph.')
  return { registrados, maisPaginas: pagina.maisPaginas, cursorAtualizado: Boolean(salvo) }
}
