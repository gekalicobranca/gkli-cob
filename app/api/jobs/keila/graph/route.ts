import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { sincronizarCaixaKeila } from '@/features/keila/graph-sync'
import { abrirMicrosoftGraph, configGraphSchema, ErroMicrosoftGraph } from '@/features/keila/microsoft-graph'
import { homologarEntradaGraph } from '@/features/keila/graph-cojur-homologacao'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const segredo = process.env.KEILA_GRAPH_JOB_SECRET
  const recebido = request.headers.get('authorization') ?? ''
  const esperado = 'Bearer ' + segredo
  if (!segredo || Buffer.byteLength(recebido) !== Buffer.byteLength(esperado) ||
    !timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))) {
    return Response.json({ erro: 'Não autorizado.' }, { status: 401 })
  }
  const verificar = new URL(request.url).searchParams.get('verificar') === 'graph'
  const casoDeHomologacao = process.env.KEILA_GRAPH_HOMOLOGACAO_CASE_ID
  if (!verificar && process.env.KEILA_GRAPH_ENABLED !== 'true') return Response.json({ pausado: true })

  const signal = AbortSignal.timeout(45_000)
  const config = {
    tenant: process.env.KEILA_GRAPH_TENANT_ID,
    aplicativo: process.env.KEILA_GRAPH_CLIENT_ID,
    segredo: process.env.KEILA_GRAPH_CLIENT_SECRET,
    desde: verificar ? new Date().toISOString() : process.env.KEILA_GRAPH_DESDE,
    caixaId: process.env.KEILA_GRAPH_MAILBOX_ID || undefined,
  }
  try {
    if (verificar) {
      const credenciais = configGraphSchema.safeParse(config)
      if (!credenciais.success) return Response.json({ erro: 'Configuração do Graph incompleta.' }, { status: 503 })
      const graph = await abrirMicrosoftGraph(credenciais.data, signal)
      await graph.pagina(null, credenciais.data.desde)
      return Response.json({ caixaKeilaAcessivel: true })
    }
    if (casoDeHomologacao) {
      if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'codex/keila-graph-homologacao' ||
          !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(casoDeHomologacao)) {
        return Response.json({ erro: 'Escopo de homologação inválido.' }, { status: 403 })
      }
      const credenciais = configGraphSchema.parse(config)
      const remetente = z.email().toLowerCase().optional().parse(process.env.KEILA_GRAPH_HOMOLOGACAO_REMETENTE || undefined)
      const graph = await abrirMicrosoftGraph(credenciais, signal)
      return Response.json(await homologarEntradaGraph(createAdminClient(), graph, casoDeHomologacao, credenciais.desde, signal, remetente))
    }
    const resultado = await sincronizarCaixaKeila(createAdminClient(), config, signal)
    return Response.json(resultado)
  } catch (erro) {
    if (erro instanceof ErroMicrosoftGraph) {
      return Response.json({
        erro: erro.etapa === 'delta' && erro.status === 410
          ? 'Cursor expirado. Conferir a retomada da sincronização antes de reiniciar.'
          : 'Microsoft Graph indisponível.',
        etapa: erro.etapa, statusGraph: erro.status,
      }, { status: 503, headers: erro.retryAfter ? { 'Retry-After': erro.retryAfter } : undefined })
    }
    return Response.json({ erro: 'A sincronização da Keila não concluiu a página.' }, { status: 503 })
  }
}
