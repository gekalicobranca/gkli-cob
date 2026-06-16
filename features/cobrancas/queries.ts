import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelations, normalizeRelationsList } from '@/utils/supabase/normalize-relation'
import { COBRANCA_STATUS_JUDICIALIZACAO } from '@/lib/constants/cobrancas'

export type CobrancaListFilters = {
  search?: string
  status?: string
  vencimentoDe?: string
  vencimentoAte?: string
  judicializacaoUnidade?: string
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]))
}

async function getUnidadeIdsComJudicializacaoAtiva(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unidadeIds: string[],
) {
  const ids = uniqueStrings(unidadeIds)
  if (ids.length === 0) return new Set<string>()

  const { data, error } = await supabase
    .from('cobrancas')
    .select('unidade_id, status, status_operacional')
    .in('unidade_id', ids)
    .or(`status_operacional.in.(${COBRANCA_STATUS_JUDICIALIZACAO.join(',')}),status.in.(${COBRANCA_STATUS_JUDICIALIZACAO.join(',')})`)

  if (error) {
    throw new Error(`Erro ao verificar judicialização por unidade: ${error.message}`)
  }

  return new Set((data ?? []).map((row: any) => row.unidade_id).filter(Boolean))
}

export async function listCobrancas(scope: CarteiraScope, filters: CobrancaListFilters = {}) {
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
      carteira_id,
      condominio_id,
      unidade_id,
      created_at,
      ultima_interacao_at,
      condominios(nome),
      unidades(identificacao, bloco, responsavel_nome)
    `)
    .order('vencimento', { ascending: true })

  query = applyCarteiraScope(query, scope.carteiraIds)

  if (filters.status) {
    query = query.or(`status_operacional.eq.${filters.status},status.eq.${filters.status}`)
  }

  if (filters.vencimentoDe) {
    query = query.gte('vencimento', filters.vencimentoDe)
  }

  if (filters.vencimentoAte) {
    query = query.lte('vencimento', filters.vencimentoAte)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar cobranças: ${error.message}`)
  }

  const rowsBase = normalizeRelationsList((data ?? []) as any[], ['condominios', 'unidades']) as any[]
  const unidadesJudicializadas = await getUnidadeIdsComJudicializacaoAtiva(
    supabase,
    rowsBase.map((row: any) => row.unidade_id),
  )
  let rows = rowsBase.map((row: any) => ({
    ...row,
    unidade_bloqueada_por_judicializacao: Boolean(row.unidade_id && unidadesJudicializadas.has(row.unidade_id)),
  }))

  const judicializacaoUnidade = filters.judicializacaoUnidade || 'nao'

  if (judicializacaoUnidade === 'sim') {
    rows = rows.filter((row: any) => row.unidade_bloqueada_por_judicializacao)
  } else if (judicializacaoUnidade !== 'todos') {
    rows = rows.filter((row: any) => !row.unidade_bloqueada_por_judicializacao)
  }

  const search = String(filters.search ?? '').trim().toLowerCase()

  if (!search) return rows

  return rows.filter((row: any) => {
    const haystack = [
      row.competencia,
      row.status,
      row.status_operacional,
      row.condominios?.nome,
      row.unidades?.identificacao,
      row.unidades?.bloco,
      row.unidades?.responsavel_nome,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(search)
  })
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
    .order('vencimento', { ascending: true })

  if (parcelasError) {
    throw new Error(`Erro ao carregar parcelas do acordo: ${parcelasError.message}`)
  }

  const parcelasNormalizadas = (parcelas ?? []) as any[]
  const parcelasEmAberto = parcelasNormalizadas.filter((parcela) =>
    ['aberta', 'vencida'].includes(String(parcela.status ?? '')),
  )
  const parcelasPagas = parcelasNormalizadas.filter((parcela) => String(parcela.status ?? '') === 'paga')
  const sumValor = (rows: any[]) => rows.reduce((sum, row) => sum + Number(row.valor ?? 0), 0)

  return {
    ...(acordo as any),
    parcelas: parcelasNormalizadas,
    proxima_parcela: parcelasEmAberto[0] ?? null,
    saldo_aberto: sumValor(parcelasEmAberto),
    valor_pago: sumValor(parcelasPagas),
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
