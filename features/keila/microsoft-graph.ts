import { z } from 'zod'
import { AGENTES_VIRTUAIS } from '../agentes-virtuais/perfis'

const origem = 'https://graph.microsoft.com'
const conta = AGENTES_VIRTUAIS.keila.email
const caixa = '/v1.0/users/' + encodeURIComponent(conta)
const campos = 'id,conversationId,internetMessageId,receivedDateTime,subject,from,webLink,hasAttachments,isDraft'

const tokenSchema = z.object({ access_token: z.string().min(1) })
const paginaSchema = z.object({
  value: z.array(z.unknown()),
  '@odata.nextLink': z.string().max(16_384).optional(),
  '@odata.deltaLink': z.string().max(16_384).optional(),
})
const corpoSchema = z.object({
  uniqueBody: z.object({ contentType: z.string(), content: z.string() }).nullish(),
})

export const emailGraphSchema = z.object({
  id: z.string().min(1).max(1000),
  conversationId: z.string().min(1).max(1000),
  internetMessageId: z.string().max(1000).nullish(),
  receivedDateTime: z.iso.datetime({ offset: true }),
  subject: z.string().nullish(),
  from: z.object({ emailAddress: z.object({ address: z.email().max(254) }) }).nullish(),
  webLink: z.string().max(4000),
  hasAttachments: z.boolean(),
  isDraft: z.boolean(),
})

export const configGraphSchema = z.object({
  tenant: z.union([z.uuid(), z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.onmicrosoft\.com$/i)]),
  aplicativo: z.uuid(),
  segredo: z.string().min(1),
  desde: z.iso.datetime({ offset: true }),
  caixaId: z.uuid().optional(),
})

type ConfigGraph = z.infer<typeof configGraphSchema>

export class ErroMicrosoftGraph extends Error {
  constructor(readonly etapa: 'token' | 'delta' | 'mensagem' | 'lista', readonly status: number, readonly retryAfter: string | null) {
    super('Microsoft Graph indisponível durante a leitura.')
  }
}

function validarCursor(cursor: string, caixaId?: string) {
  const url = new URL(cursor)
  const partes = url.pathname.split('/').flatMap(parte => {
    const decodificada = decodeURIComponent(parte)
    const indexacao = /^(users|mailfolders)\('([^']+)'\)$/i.exec(decodificada)
    return indexacao ? [indexacao[1], indexacao[2]] : [decodificada]
  })
  if (url.origin !== origem || url.username || url.password || url.hash ||
    partes.length !== 8 || partes[1] !== 'v1.0' || partes[2].toLowerCase() !== 'users' ||
    ![conta, caixaId?.toLowerCase()].includes(partes[3].toLowerCase()) || partes[4].toLowerCase() !== 'mailfolders' ||
    !/^[A-Za-z0-9_+=/-]+$/.test(partes[5]) || partes[6].toLowerCase() !== 'messages' || partes[7].toLowerCase() !== 'delta' ||
    !(url.searchParams.has('$skiptoken') || url.searchParams.has('$deltatoken'))) {
    throw new Error('Cursor do Microsoft Graph fora da caixa da Keila.')
  }
  return url
}

export async function abrirMicrosoftGraph(config: ConfigGraph, signal: AbortSignal, requisitar = fetch) {
  const tokenResposta = await requisitar(
    'https://login.microsoftonline.com/' + encodeURIComponent(config.tenant) + '/oauth2/v2.0/token',
    {
      method: 'POST', redirect: 'error', cache: 'no-store', signal,
      body: new URLSearchParams({
        grant_type: 'client_credentials', scope: origem + '/.default',
        client_id: config.aplicativo, client_secret: config.segredo,
      }),
    },
  )
  if (!tokenResposta.ok) throw new ErroMicrosoftGraph('token', tokenResposta.status, tokenResposta.headers.get('retry-after'))
  const token = tokenSchema.parse(await tokenResposta.json()).access_token

  function ler(url: URL, prefer: string) {
    return requisitar(url, {
      method: 'GET', redirect: 'error', cache: 'no-store', signal,
      headers: { Authorization: 'Bearer ' + token, Prefer: 'IdType="ImmutableId", ' + prefer },
    })
  }

  return {
    async recentesDoRemetente(desde: string, remetente: string) {
      const url = new URL(caixa + '/messages', origem)
      url.searchParams.set('$select', campos)
      url.searchParams.set('$filter', 'receivedDateTime ge ' + desde + " and from/emailAddress/address eq '" +
        remetente.replaceAll("'", "''") + "'")
      url.searchParams.set('$orderby', 'receivedDateTime desc')
      url.searchParams.set('$top', '40')
      const resposta = await ler(url, 'odata.maxpagesize=40')
      if (!resposta.ok) throw new ErroMicrosoftGraph('lista', resposta.status, resposta.headers.get('retry-after'))
      return paginaSchema.parse(await resposta.json()).value
    },
    async recentes(desde: string, pasta: 'inbox' | 'archive', assuntoSafira: boolean) {
      const url = new URL(caixa + '/mailFolders/' + pasta + '/messages', origem)
      url.searchParams.set('$select', campos)
      url.searchParams.set('$filter', 'receivedDateTime ge ' + desde + (assuntoSafira ? " and contains(subject,'Safira')" : ''))
      url.searchParams.set('$orderby', 'receivedDateTime desc')
      url.searchParams.set('$top', '100')
      const resposta = await ler(url, 'odata.maxpagesize=100')
      if (pasta === 'archive' && resposta.status === 404) return []
      if (!resposta.ok) throw new ErroMicrosoftGraph('lista', resposta.status, resposta.headers.get('retry-after'))
      return paginaSchema.parse(await resposta.json()).value
    },
    async conferirMensagem(id: string) {
      const url = new URL(caixa + '/messages/' + encodeURIComponent(id), origem)
      url.searchParams.set('$select', 'id')
      const resposta = await ler(url, 'outlook.body-content-type="text"')
      if (!resposta.ok) throw new ErroMicrosoftGraph('mensagem', resposta.status, resposta.headers.get('retry-after'))
      return z.object({ id: z.string() }).parse(await resposta.json()).id === id
    },
    async pagina(cursor: string | null, desde: string) {
      const url = cursor ? validarCursor(cursor, config.caixaId) : new URL(caixa + '/mailFolders/inbox/messages/delta', origem)
      if (!cursor) {
        url.searchParams.set('$select', campos)
        url.searchParams.set('$filter', 'receivedDateTime ge ' + desde)
        url.searchParams.set('changeType', 'created')
      }
      const resposta = await ler(url, 'odata.maxpagesize=10')
      if (!resposta.ok) throw new ErroMicrosoftGraph('delta', resposta.status, resposta.headers.get('retry-after'))
      const dados = paginaSchema.parse(await resposta.json())
      const proxima = dados['@odata.nextLink'] ?? dados['@odata.deltaLink']
      if (!proxima) throw new Error('Página do Graph sem cursor de continuação.')
      validarCursor(proxima, config.caixaId)
      return { itens: dados.value, proxima, maisPaginas: Boolean(dados['@odata.nextLink']) }
    },
    async corpoUnico(id: string) {
      const url = new URL(caixa + '/messages/' + encodeURIComponent(id), origem)
      url.searchParams.set('$select', 'uniqueBody')
      const resposta = await ler(url, 'outlook.body-content-type="text"')
      if (resposta.status === 404) return null
      if (!resposta.ok) throw new ErroMicrosoftGraph('mensagem', resposta.status, resposta.headers.get('retry-after'))
      const corpo = corpoSchema.parse(await resposta.json()).uniqueBody
      return corpo?.contentType.toLowerCase() === 'text' ? corpo.content : null
    },
  }
}
