import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelations, normalizeRelationsList } from '@/utils/supabase/normalize-relation'

export async function listCobrancas(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('cobrancas')
    .select(`
      id,
      competencia,
      vencimento,
      valor_original,
      valor_atualizado,
      juros,
      multa,
      correcao,
      desconto,
      status,
      status_operacional,
      status_financeiro,
      created_at,
      ultima_interacao_at,
      condominios(nome),
      unidades(identificacao, responsavel_nome)
    `)
    .order('vencimento', { ascending: true })

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar cobranças: ${error.message}`)
  }

  return normalizeRelationsList((data ?? []) as any[], ['condominios', 'unidades']) as any[]
}

export async function getCobrancaDetalhe(id: string, scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('cobrancas')
    .select(`
      id,
      carteira_id,
      condominio_id,
      unidade_id,
      operador_id,
      competencia,
      vencimento,
      valor_original,
      valor_atualizado,
      juros,
      multa,
      correcao,
      desconto,
      observacao_financeira,
      status,
      status_operacional,
      status_financeiro,
      observacoes,
      ultima_interacao_at,
      created_at,
      updated_at,
      condominios(nome, cnpj, administradora, inicio_cobranca_dias),
      unidades(identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email)
    `)
    .eq('id', id)
    .maybeSingle()

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar cobrança: ${error.message}`)
  }

  return data ? (normalizeRelations(data as any, ['condominios', 'unidades']) as any) : null
}

export async function listInteracoesDaCobranca(cobrancaId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('interacoes')
    .select(`
      id,
      tipo,
      conteudo,
      created_at,
      profiles(nome, email)
    `)
    .eq('cobranca_id', cobrancaId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Erro ao carregar interações: ${error.message}`)
  }

  return normalizeRelationsList((data ?? []) as any[], ['profiles']) as any[]
}

export async function getAcordoVigenteDaCobranca(cobrancaId: string) {
  const supabase = await createClient()

  const { data: acordo, error } = await supabase
    .from('acordos')
    .select(`
      id,
      status,
      status_financeiro,
      risco,
      valor_acordado,
      entrada,
      data_acordo,
      despesa_cobranca_percentual,
      despesa_cobranca_valor
    `)
    .eq('cobranca_id', cobrancaId)
    .in('status', ['ativo', 'em_dia', 'em_atraso', 'vencido'])
    .order('data_acordo', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Erro ao carregar acordo vigente: ${error.message}`)
  }

  if (!acordo) return null

  const { data: parcelas, error: parcelasError } = await supabase
    .from('parcelas_acordo')
    .select('id, numero, tipo_parcela, valor, vencimento, status')
    .eq('acordo_id', acordo.id)
    .in('status', ['aberta', 'vencida'])
    .order('vencimento', { ascending: true })
    .limit(1)

  if (parcelasError) {
    throw new Error(`Erro ao carregar próxima parcela do acordo: ${parcelasError.message}`)
  }

  return {
    ...(acordo as any),
    proxima_parcela: (parcelas ?? [])[0] ?? null,
  }
}

export async function listMensagensDaCobranca(cobrancaId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('mensagens')
    .select(`
      id,
      canal,
      status,
      status_operacional,
      destinatario,
      conteudo,
      conteudo_renderizado,
      email_assunto,
      whatsapp_numero,
      whatsapp_link,
      ultimo_erro,
      created_at,
      criado_em,
      enviada_em,
      enviada_manual_em
    `)
    .eq('cobranca_id', cobrancaId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    throw new Error(`Erro ao carregar mensagens da cobrança: ${error.message}`)
  }

  return (data ?? []) as any[]
}

export type TimelineOperacionalItem = {
  id: string
  tipo: string
  titulo: string
  descricao: string | null
  estado_anterior: string | null
  estado_novo: string | null
  severidade: string
  criado_em: string
  origem: 'evento' | 'auditoria' | 'interacao' | 'acordo_timeline'
  payload?: Record<string, unknown> | null
}

function normalizeEventoOperacional(evento: any): TimelineOperacionalItem {
  const payload = evento.payload ?? evento.depois ?? {}
  return {
    id: evento.id,
    tipo: evento.tipo ?? evento.evento_tipo ?? payload?.evento_codigo ?? 'evento_operacional',
    titulo: payload?.titulo ?? evento.titulo ?? evento.tipo ?? evento.evento_tipo ?? 'Evento operacional',
    descricao: evento.descricao ?? null,
    estado_anterior: evento.estado_anterior ?? null,
    estado_novo: evento.estado_novo ?? null,
    severidade: payload?.severidade ?? 'info',
    criado_em: evento.created_at ?? evento.criado_em,
    origem: evento.tipo ? 'evento' : 'auditoria',
    payload,
  }
}


export async function listEventosOperacionaisDaCobranca(cobrancaId: string) {
  const supabase = await createClient()

  const [eventosResult, auditoriaResult] = await Promise.all([
    supabase
      .from('eventos_operacionais')
      .select('id,tipo,descricao,estado_anterior,estado_novo,payload,created_at')
      .eq('cobranca_id', cobrancaId)
      .order('created_at', { ascending: false })
      .limit(80),
    supabase
      .from('auditoria_eventos')
      .select('id,evento_tipo,titulo,descricao,depois,criado_em')
      .eq('entidade_tipo', 'cobranca')
      .eq('entidade_id', cobrancaId)
      .order('criado_em', { ascending: false })
      .limit(80),
  ])

  if (eventosResult.error) {
    throw new Error(`Erro ao carregar eventos da cobrança: ${eventosResult.error.message}`)
  }

  if (auditoriaResult.error) {
    throw new Error(`Erro ao carregar auditoria da cobrança: ${auditoriaResult.error.message}`)
  }

  return [
    ...((eventosResult.data ?? []) as any[]).map(normalizeEventoOperacional),
    ...((auditoriaResult.data ?? []) as any[]).map(normalizeEventoOperacional),
  ]
    .filter((item) => item.criado_em)
    .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())
}
