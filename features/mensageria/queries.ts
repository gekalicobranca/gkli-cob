import { createAdminClient } from '@/utils/supabase/admin'
import { requireUser } from '@/utils/auth/require-user'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { applyCarteiraScope, applyCarteiraScopeWithGlobal } from '@/utils/auth/carteira-scope'

export type TemplateMensageria = {
  id: string
  nome: string
  codigo: string | null
  tipo: string | null
  canal: string
  assunto: string | null
  conteudo: string
  ativo: boolean
  carteira_id?: string | null
  carteira_nome?: string | null
  created_at: string
  updated_at?: string | null
}

export type MensageriaLog = {
  id: string
  carteira_id: string | null
  lote_id: string | null
  lote_item_id: string | null
  mensagem_id: string | null
  evento: string
  status_anterior: string | null
  status_novo: string | null
  descricao: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

export type MensagemMensageria = MensageriaLog

function logSupabaseError(contexto: string, error: unknown) {
  const err = error as { message?: string; details?: string; hint?: string; code?: string }
  console.error(contexto, {
    message: err?.message,
    details: err?.details,
    hint: err?.hint,
    code: err?.code,
  })
}

async function getCarteiraNomeMap(carteiraIds: string[]) {
  await requireUser()
  const uniqueIds = Array.from(new Set(carteiraIds.filter(Boolean)))
  const result = new Map<string, string>()

  if (uniqueIds.length === 0) return result

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('carteiras')
    .select('id,nome')
    .in('id', uniqueIds)

  if (error) {
    logSupabaseError('Erro ao carregar nomes das carteiras dos templates:', error)
    return result
  }

  for (const row of data ?? []) {
    result.set((row as any).id, (row as any).nome ?? 'Carteira')
  }

  return result
}

export async function listTemplates(scope?: CarteiraScope): Promise<TemplateMensageria[]> {
  await requireUser()
  const supabase = createAdminClient()

  let query = supabase
    .from('mensagens_templates')
    .select('id,nome,tipo,canal,assunto,conteudo,ativo,carteira_id,created_at,updated_at')
    .order('nome', { ascending: true })

  query = applyCarteiraScopeWithGlobal(query, scope)

  const { data, error } = await query

  if (error) {
    logSupabaseError('Erro ao carregar templates:', error)
    return []
  }

  const rows = (data ?? []) as any[]
  const carteiraNome = await getCarteiraNomeMap(rows.map((row) => row.carteira_id).filter(Boolean))

  return rows.map((row: any) => ({
    ...row,
    codigo: row.tipo ?? null,
    carteira_nome: row.carteira_id ? carteiraNome.get(row.carteira_id) ?? 'Carteira específica' : null,
  })) as TemplateMensageria[]
}

export async function listTemplatesMensageria(scope?: CarteiraScope) {
  return listTemplates(scope)
}

export async function getTemplateById(id: string, scope?: CarteiraScope): Promise<TemplateMensageria | null> {
  await requireUser()
  const supabase = createAdminClient()

  let query = supabase
    .from('mensagens_templates')
    .select('id,nome,tipo,canal,assunto,conteudo,ativo,carteira_id,created_at,updated_at')
    .eq('id', id)

  query = applyCarteiraScopeWithGlobal(query, scope)

  const { data, error } = await query.maybeSingle()

  if (error) {
    logSupabaseError('Erro ao carregar template:', error)
    return null
  }

  if (!data) return null

  const row = data as any
  const carteiraNome = await getCarteiraNomeMap(row.carteira_id ? [row.carteira_id] : [])
  return {
    ...row,
    codigo: row.tipo ?? null,
    carteira_nome: row.carteira_id ? carteiraNome.get(row.carteira_id) ?? 'Carteira específica' : null,
  } as TemplateMensageria
}

export async function getTemplateDetalhe(id: string, scope?: CarteiraScope) {
  return getTemplateById(id, scope)
}

export async function countReguaEtapasPorTemplate(templateIds?: string[]) {
  await requireUser()
  const supabase = createAdminClient()

  let query = supabase
    .from('regua_etapas')
    .select('template_id')

  if (templateIds?.length) {
    query = query.in('template_id', templateIds)
  }

  const { data, error } = await query

  if (error) {
    logSupabaseError('Erro ao contar etapas da régua:', error)
    return new Map<string, number>()
  }

  const result = new Map<string, number>()

  for (const row of data ?? []) {
    const templateId = row.template_id as string | null
    if (!templateId) continue
    result.set(templateId, (result.get(templateId) ?? 0) + 1)
  }

  return result
}

export async function listMensageriaLogs(scope?: CarteiraScope): Promise<MensageriaLog[]> {
  await requireUser()
  const supabase = createAdminClient()

  let query = supabase
    .from('mensageria_logs')
    .select('id,carteira_id,lote_id,lote_item_id,mensagem_id,evento,status_anterior,status_novo,descricao,payload,created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  query = applyCarteiraScope(query, scope)

  const { data, error } = await query

  if (error) {
    logSupabaseError('Erro ao carregar logs de mensageria:', error)
    return []
  }

  return (data ?? []) as MensageriaLog[]
}

export async function listMensagens(scope?: CarteiraScope) {
  return listMensageriaLogs(scope)
}

export async function getMensagemById(id: string): Promise<MensageriaLog | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('mensageria_logs')
    .select('id,carteira_id,lote_id,lote_item_id,mensagem_id,evento,status_anterior,status_novo,descricao,payload,created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    logSupabaseError('Erro ao carregar mensagem/log:', error)
    return null
  }

  return data as MensageriaLog | null
}

export async function getMensagemDetalhe(id: string) {
  return getMensagemById(id)
}

export async function listMensagensPorTemplate(templateId: string) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('mensagens')
    .select('*')
    .eq('template_id', templateId)
    .order('created_at', { ascending: false })

  if (error) {
    logSupabaseError('Erro ao carregar mensagens do template:', error)
    return []
  }

  return data ?? []
}

export async function listMensagensPorStatus(status: string) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('mensagens')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false })

  if (error) {
    logSupabaseError('Erro ao carregar mensagens por status:', error)
    return []
  }

  return data ?? []
}


export type MensageriaCockpitMensagem = {
  id: string
  carteira_id: string | null
  lote_id: string | null
  contexto: string | null
  canal: string | null
  destinatario: string | null
  conteudo: string | null
  conteudo_renderizado: string | null
  status: string | null
  status_operacional: string | null
  erro: string | null
  erro_envio: string | null
  whatsapp_link: string | null
  opened_whatsapp_at: string | null
  ultima_tentativa_em: string | null
  enviada_manual: boolean | null
  created_at: string | null
}

export type MensageriaCockpitLote = {
  id: string
  carteira_id: string | null
  tipo: string | null
  status: string | null
  total_criadas: number | null
  total_pendentes: number | null
  total_aprovadas: number | null
  total_enviadas: number | null
  total_erros: number | null
  created_at: string | null
}

export type MensageriaCockpitData = {
  mensagens: MensageriaCockpitMensagem[]
  lotes: MensageriaCockpitLote[]
  logs: MensageriaLog[]
  resumo: {
    total: number
    pendentes: number
    aprovadas: number
    enviadas: number
    falhas: number
    aguardandoRetorno: number
    whatsapp: number
    email: number
  }
}

function statusOperacional(row: { status_operacional?: string | null; status?: string | null }) {
  return row.status_operacional || row.status || 'rascunho'
}

export async function getMensageriaCockpit(scope?: CarteiraScope): Promise<MensageriaCockpitData> {
  const supabase = createAdminClient()

  let mensagensQuery = supabase
    .from('mensagens')
    .select('id,carteira_id,lote_id,contexto,canal,destinatario,conteudo,conteudo_renderizado,status,status_operacional,erro,erro_envio,whatsapp_link,opened_whatsapp_at,ultima_tentativa_em,enviada_manual,created_at')
    .order('created_at', { ascending: false })
    .limit(120)

  let lotesQuery = supabase
    .from('lotes')
    .select('id,carteira_id,tipo,status,total_criadas,total_pendentes,total_aprovadas,total_enviadas,total_erros,created_at')
    .in('tipo', ['regua_cobranca', 'regua_acordo', 'mensageria'])
    .order('created_at', { ascending: false })
    .limit(12)

  mensagensQuery = applyCarteiraScope(mensagensQuery, scope)
  lotesQuery = applyCarteiraScope(lotesQuery, scope)

  const [{ data: mensagens, error: mensagensError }, { data: lotes, error: lotesError }, logs] = await Promise.all([
    mensagensQuery,
    lotesQuery,
    listMensageriaLogs(scope),
  ])

  if (mensagensError) {
    logSupabaseError('Erro ao carregar cockpit de mensagens:', mensagensError)
  }

  if (lotesError) {
    logSupabaseError('Erro ao carregar lotes do cockpit de mensageria:', lotesError)
  }

  const rows = (mensagens ?? []) as MensageriaCockpitMensagem[]

  const resumo = rows.reduce(
    (acc, row) => {
      const status = statusOperacional(row)
      acc.total += 1
      if (status === 'pendente_aprovacao' || status === 'rascunho' || status === 'agendada') acc.pendentes += 1
      if (status === 'aprovada' || status === 'aprovado') acc.aprovadas += 1
      if (status === 'enviada' || status === 'enviado') acc.enviadas += 1
      if (status === 'falha' || status === 'erro') acc.falhas += 1
      if (status === 'aguardando_retorno') acc.aguardandoRetorno += 1
      if (row.canal === 'whatsapp') acc.whatsapp += 1
      if (row.canal === 'email') acc.email += 1
      return acc
    },
    { total: 0, pendentes: 0, aprovadas: 0, enviadas: 0, falhas: 0, aguardandoRetorno: 0, whatsapp: 0, email: 0 },
  )

  return {
    mensagens: rows,
    lotes: (lotes ?? []) as MensageriaCockpitLote[],
    logs,
    resumo,
  }
}
