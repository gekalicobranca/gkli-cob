import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelations, normalizeRelationsList } from '@/utils/supabase/normalize-relation'
import {
  COBRANCA_STATUS_JUDICIALIZACAO,
  COBRANCA_STATUS_OPERACIONAL,
} from '@/lib/constants/cobrancas'
import { getCobrancaStatusOperacional } from '@/lib/core/cobranca-status'
import { getAdministradoraAliasKey } from '@/lib/core/administradora'

export type CobrancaListFilters = {
  search?: string
  administradoraId?: string
  condominioId?: string
  unidadeId?: string
  status?: string
  statusList?: string[]
  vencimentoDe?: string
  vencimentoAte?: string
  judicializacaoUnidade?: string
  limit?: number
}

export type CobrancaPageOptions = {
  page?: number
  pageSize?: number
  orderBy?: string
}

export type CobrancaResumo = {
  total: number
  totalEmAberto: number
  totalNegociacao: number
  novas: number
  ativas: number
  emNegociacao: number
  possiveisAcordo: number
}

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000'

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]))
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function isMissingDestinatarioPreferencial(error: any) {
  const message = String(error?.message ?? '')
  return error?.code === '42703' || error?.code === 'PGRST204' || message.includes('destinatario_preferencial')
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

async function listAllUnidadeIdsComJudicializacaoAtiva(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: CarteiraScope,
) {
  let query = supabase
    .from('cobrancas')
    .select('unidade_id, carteira_id')
    .or(`status_operacional.in.(${COBRANCA_STATUS_JUDICIALIZACAO.join(',')}),status.in.(${COBRANCA_STATUS_JUDICIALIZACAO.join(',')})`)
    .not('unidade_id', 'is', null)

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao verificar judicialização por unidade: ${error.message}`)
  }

  return uniqueStrings((data ?? []).map((row: any) => row.unidade_id))
}

async function listCondominioIdsMatchingSearch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: CarteiraScope,
  term: string,
) {
  const digits = onlyDigits(term)
  const clauses = [
    `nome.ilike.%${term}%`,
    `nome_operacional.ilike.%${term}%`,
    `administradora.ilike.%${term}%`,
  ]

  if (digits) {
    clauses.push(`cnpj.ilike.%${digits}%`)
  } else {
    clauses.push(`cnpj.ilike.%${term}%`)
  }

  let query = supabase
    .from('condominios')
    .select('id, carteira_id')
    .or(clauses.join(','))
    .limit(500)

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao buscar condomínios vinculados às cobranças: ${error.message}`)
  return (data ?? []).map((row: any) => String(row.id)).filter(Boolean)
}

async function listUnidadeIdsMatchingSearch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: CarteiraScope,
  term: string,
) {
  const digits = onlyDigits(term)
  const clauses = [
    `identificacao.ilike.%${term}%`,
    `bloco.ilike.%${term}%`,
    `responsavel_nome.ilike.%${term}%`,
    `email.ilike.%${term}%`,
  ]

  if (digits) {
    clauses.push(`responsavel_documento.ilike.%${digits}%`, `telefone.ilike.%${digits}%`)
  } else {
    clauses.push(`responsavel_documento.ilike.%${term}%`, `telefone.ilike.%${term}%`)
  }

  let query = supabase
    .from('unidades')
    .select('id, carteira_id')
    .or(clauses.join(','))
    .limit(1000)

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao buscar unidades vinculadas às cobranças: ${error.message}`)
  return (data ?? []).map((row: any) => String(row.id)).filter(Boolean)
}

async function listCondominioIdsByAdministradora(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: CarteiraScope,
  administradoraId: string,
) {
  if (administradoraId.startsWith('alias:')) {
    const aliasKey = administradoraId.slice('alias:'.length)
    let aliasQuery = supabase
      .from('condominios')
      .select('id, carteira_id, administradora, administradoras:administradora_id(nome)')

    aliasQuery = applyCarteiraScope(aliasQuery, scope.carteiraIds)

    const { data, error } = await aliasQuery
    if (error) throw new Error(`Erro ao filtrar cobranças por administradora: ${error.message}`)

    return (data ?? [])
      .filter((row: any) => {
        const relation = Array.isArray(row.administradoras) ? row.administradoras[0] : row.administradoras
        return getAdministradoraAliasKey(relation?.nome ?? row.administradora) === aliasKey
      })
      .map((row: any) => String(row.id))
      .filter(Boolean)
  }

  let query = supabase
    .from('condominios')
    .select('id, carteira_id')

  if (administradoraId.startsWith('legacy:')) {
    query = query.eq('administradora', administradoraId.slice('legacy:'.length))
  } else {
    query = query.eq('administradora_id', administradoraId)
  }

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao filtrar cobranças por administradora: ${error.message}`)
  return (data ?? []).map((row: any) => String(row.id)).filter(Boolean)
}

async function applyCobrancaFilters(
  query: any,
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: CarteiraScope,
  filters: CobrancaListFilters,
) {
  let scopedQuery = query

  if (filters.statusList?.length) {
    scopedQuery = scopedQuery.or(
      `status_operacional.in.(${filters.statusList.join(',')}),status.in.(${filters.statusList.join(',')})`,
    )
  } else if (filters.status) {
    scopedQuery = scopedQuery.or(`status_operacional.eq.${filters.status},status.eq.${filters.status}`)
  }

  if (filters.vencimentoDe) {
    scopedQuery = scopedQuery.gte('vencimento', filters.vencimentoDe)
  }

  if (filters.vencimentoAte) {
    scopedQuery = scopedQuery.lte('vencimento', filters.vencimentoAte)
  }

  if (filters.administradoraId) {
    const condominioIds = await listCondominioIdsByAdministradora(
      supabase,
      scope,
      filters.administradoraId,
    )
    scopedQuery = scopedQuery.in('condominio_id', condominioIds.length ? condominioIds : [EMPTY_UUID])
  }

  if (filters.condominioId) {
    scopedQuery = scopedQuery.eq('condominio_id', filters.condominioId)
  }

  if (filters.unidadeId) {
    scopedQuery = scopedQuery.eq('unidade_id', filters.unidadeId)
  }

  const judicializacaoUnidade = filters.judicializacaoUnidade || 'nao'
  if (judicializacaoUnidade !== 'todos') {
    const unidadeIds = await listAllUnidadeIdsComJudicializacaoAtiva(supabase, scope)
    if (judicializacaoUnidade === 'sim') {
      scopedQuery = scopedQuery.in('unidade_id', unidadeIds.length ? unidadeIds : [EMPTY_UUID])
    } else if (unidadeIds.length > 0) {
      scopedQuery = scopedQuery.not('unidade_id', 'in', `(${unidadeIds.join(',')})`)
    }
  }

  const search = String(filters.search ?? '').trim()
  if (search) {
    const term = search.replace(/[%_]/g, '')
    const [condominioIds, unidadeIds] = await Promise.all([
      listCondominioIdsMatchingSearch(supabase, scope, term),
      listUnidadeIdsMatchingSearch(supabase, scope, term),
    ])
    const clauses = [
      `competencia.ilike.%${term}%`,
      `status.ilike.%${term}%`,
      `status_operacional.ilike.%${term}%`,
    ]

    if (condominioIds.length > 0) {
      clauses.push(`condominio_id.in.(${condominioIds.join(',')})`)
    }

    if (unidadeIds.length > 0) {
      clauses.push(`unidade_id.in.(${unidadeIds.join(',')})`)
    }

    scopedQuery = scopedQuery.or(clauses.join(','))
  }

  return { query: scopedQuery }
}

function applyCobrancaOrder(query: any, orderBy?: string) {
  if (orderBy === 'vencimento_desc') return query.order('vencimento', { ascending: false })
  if (orderBy === 'valor_desc') return query.order('valor_atualizado', { ascending: false }).order('vencimento', { ascending: true })
  if (orderBy === 'valor_asc') return query.order('valor_atualizado', { ascending: true }).order('vencimento', { ascending: true })
  if (orderBy === 'status') return query.order('status_operacional', { ascending: true }).order('vencimento', { ascending: true })
  return query.order('vencimento', { ascending: true })
}

const RELATED_ORDER_FIELDS = new Set(['condominio', 'unidade', 'responsavel'])

function compareText(left: unknown, right: unknown) {
  return String(left ?? '').localeCompare(String(right ?? ''), 'pt-BR', {
    numeric: true,
    sensitivity: 'base',
  })
}

function compareDate(left: unknown, right: unknown) {
  return String(left ?? '').localeCompare(String(right ?? ''))
}

export function ordenarCobrancasPorCampoRelacionado(rows: any[], orderBy?: string) {
  if (!RELATED_ORDER_FIELDS.has(String(orderBy ?? ''))) return rows

  return [...rows].sort((left, right) => {
    let comparison = 0

    if (orderBy === 'condominio') {
      comparison = compareText(left.condominios?.nome, right.condominios?.nome)
    } else if (orderBy === 'unidade') {
      comparison = compareText(left.unidades?.bloco, right.unidades?.bloco)
        || compareText(left.unidades?.identificacao, right.unidades?.identificacao)
    } else if (orderBy === 'responsavel') {
      comparison = compareText(left.unidades?.responsavel_nome, right.unidades?.responsavel_nome)
    }

    return comparison
      || compareText(left.unidades?.bloco, right.unidades?.bloco)
      || compareText(left.unidades?.identificacao, right.unidades?.identificacao)
      || compareDate(left.vencimento, right.vencimento)
      || compareText(left.id, right.id)
  })
}

export async function listCobrancas(scope: CarteiraScope, filters: CobrancaListFilters = {}) {
  const supabase = await createClient()
  const limit = Number(filters.limit ?? 0)

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
      carteiras(nome),
      condominios(nome, cnpj, administradora, vencimento_cota_dia, inicio_cobranca_dias, regua_cobranca_id),
      unidades(identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email)
    `)

  query = applyCarteiraScope(query, scope.carteiraIds)
  query = (await applyCobrancaFilters(query, supabase, scope, filters)).query
  query = applyCobrancaOrder(query)

  if (Number.isFinite(limit) && limit > 0) {
    query = query.limit(limit)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar cobranças: ${error.message}`)
  }

  const rowsBase = normalizeRelationsList((data ?? []) as any[], ['carteiras', 'condominios', 'unidades']) as any[]
  const unidadesJudicializadas = await getUnidadeIdsComJudicializacaoAtiva(
    supabase,
    rowsBase.map((row: any) => row.unidade_id),
  )
  const rows = rowsBase.map((row: any) => ({
    ...row,
    unidade_bloqueada_por_judicializacao: Boolean(row.unidade_id && unidadesJudicializadas.has(row.unidade_id)),
  }))

  return rows
}

export async function listCobrancasPage(
  scope: CarteiraScope,
  filters: CobrancaListFilters = {},
  options: CobrancaPageOptions = {},
) {
  const supabase = await createClient()
  const pageSize = Math.max(1, Number(options.pageSize ?? 100))
  const page = Math.max(1, Number(options.page ?? 1))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  if (RELATED_ORDER_FIELDS.has(String(options.orderBy ?? ''))) {
    const allRows: any[] = []
    const batchSize = 1000

    for (let batchFrom = 0; ; batchFrom += batchSize) {
      let relatedQuery = supabase
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
          carteiras(nome),
          condominios(nome),
          unidades(identificacao, bloco, responsavel_nome)
        `)

      relatedQuery = applyCarteiraScope(relatedQuery, scope.carteiraIds)
      relatedQuery = (await applyCobrancaFilters(relatedQuery, supabase, scope, filters)).query
      relatedQuery = relatedQuery.order('id', { ascending: true }).range(batchFrom, batchFrom + batchSize - 1)

      const { data, error } = await relatedQuery
      if (error) throw new Error(`Erro ao carregar cobranças para ordenação: ${error.message}`)

      const batch = normalizeRelationsList((data ?? []) as any[], ['carteiras', 'condominios', 'unidades']) as any[]
      allRows.push(...batch)
      if (batch.length < batchSize) break
    }

    const orderedRows = ordenarCobrancasPorCampoRelacionado(allRows, options.orderBy)
    const pageRows = orderedRows.slice(from, to + 1)
    const unidadesJudicializadas = await getUnidadeIdsComJudicializacaoAtiva(
      supabase,
      pageRows.map((row: any) => row.unidade_id),
    )

    return {
      rows: pageRows.map((row: any) => ({
        ...row,
        unidade_bloqueada_por_judicializacao: Boolean(row.unidade_id && unidadesJudicializadas.has(row.unidade_id)),
      })),
      total: orderedRows.length,
      page,
      pageSize,
    }
  }

  async function buildQuery(withCount: boolean) {
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
        carteiras(nome),
        condominios(nome),
        unidades(identificacao, bloco, responsavel_nome)
      `, withCount ? { count: 'planned' } : undefined)

    query = applyCarteiraScope(query, scope.carteiraIds)
    query = (await applyCobrancaFilters(query, supabase, scope, filters)).query
    query = applyCobrancaOrder(query, options.orderBy)
    return query.range(from, to)
  }

  let { data, error, count } = await buildQuery(true)

  if (error) {
    const retry = await buildQuery(false)
    data = retry.data
    error = retry.error
    count = null
  }

  if (error) {
    throw new Error(`Erro ao carregar cobranças: ${error.message}`)
  }

  const rowsBase = normalizeRelationsList((data ?? []) as any[], ['carteiras', 'condominios', 'unidades']) as any[]
  const unidadesJudicializadas = await getUnidadeIdsComJudicializacaoAtiva(
    supabase,
    rowsBase.map((row: any) => row.unidade_id),
  )

  return {
    rows: rowsBase.map((row: any) => ({
      ...row,
      unidade_bloqueada_por_judicializacao: Boolean(row.unidade_id && unidadesJudicializadas.has(row.unidade_id)),
    })),
    total: count ?? from + rowsBase.length + (rowsBase.length === pageSize ? 1 : 0),
    page,
    pageSize,
  }
}

export async function summarizeCobrancas(scope: CarteiraScope, filters: CobrancaListFilters = {}): Promise<CobrancaResumo> {
  const supabase = await createClient()
  const pageSize = 1000
  const rows: any[] = []

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from('cobrancas')
      .select('id,valor_atualizado,status,status_operacional,status_financeiro')

    query = applyCarteiraScope(query, scope.carteiraIds)
    query = (await applyCobrancaFilters(query, supabase, scope, filters)).query
    query = query.range(from, from + pageSize - 1)

    const { data, error } = await query

    if (error) {
      throw new Error(`Erro ao resumir cobranças: ${error.message}`)
    }

    rows.push(...((data ?? []) as any[]))
    if (!data || data.length < pageSize) break
  }

  const withoutOpenValue = new Set<string>([
    COBRANCA_STATUS_OPERACIONAL.ACORDO_EFETIVADO,
    COBRANCA_STATUS_OPERACIONAL.PRE_JURIDICO,
    COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO,
    COBRANCA_STATUS_OPERACIONAL.SUSPENSO,
  ])
  const totalNegociacao = rows
    .filter((row) => getCobrancaStatusOperacional(row) === COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO)
    .reduce((sum, row) => sum + Number(row.valor_atualizado ?? 0), 0)

  return {
    total: rows.length,
    totalEmAberto: rows
      .filter((row) => !withoutOpenValue.has(getCobrancaStatusOperacional(row)))
      .reduce((sum, row) => sum + Number(row.valor_atualizado ?? 0), 0),
    totalNegociacao,
    novas: rows.filter((row) => getCobrancaStatusOperacional(row) === COBRANCA_STATUS_OPERACIONAL.NOVO).length,
    ativas: rows.filter((row) => getCobrancaStatusOperacional(row) === COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA).length,
    emNegociacao: rows.filter((row) => getCobrancaStatusOperacional(row) === COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO).length,
    possiveisAcordo: rows.filter((row) => getCobrancaStatusOperacional(row) === COBRANCA_STATUS_OPERACIONAL.POSSIVEL_ACORDO).length,
  }
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
      condominios(nome, cnpj, administradora, inicio_cobranca_dias, regua_cobranca_id, regua_acordo_id),
      unidades(identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email)
    `)
    .eq('id', id)
    .maybeSingle()

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar cobrança: ${error.message}`)
  }

  if (!data) return null

  const cobranca = normalizeRelations(data as any, ['condominios', 'unidades']) as any
  const reguaIds = [
    cobranca.condominios?.regua_cobranca_id,
    cobranca.condominios?.regua_acordo_id,
  ].filter(Boolean) as string[]

  if (reguaIds.length) {
    let { data: reguas, error: reguasError }: { data: any[] | null; error: any } = await supabase
      .from('reguas')
      .select('id, nome, tipo, status, prioridade, padrao, destinatario_preferencial')
      .in('id', [...new Set(reguaIds)])

    if (reguasError && isMissingDestinatarioPreferencial(reguasError)) {
      const legacy = await supabase
        .from('reguas')
        .select('id, nome, tipo, status, prioridade, padrao')
        .in('id', [...new Set(reguaIds)])
      reguas = legacy.data
      reguasError = legacy.error
    }

    if (reguasError) {
      throw new Error(`Erro ao carregar régua da cobrança: ${reguasError.message}`)
    }

    const reguasMap = new Map(((reguas ?? []) as any[]).map((regua) => [
      regua.id,
      { ...regua, destinatario_preferencial: regua.destinatario_preferencial ?? 'proprietario' },
    ]))
    cobranca.regua_cobranca = reguasMap.get(cobranca.condominios?.regua_cobranca_id) ?? null
    cobranca.regua_acordo = reguasMap.get(cobranca.condominios?.regua_acordo_id) ?? null
  } else {
    cobranca.regua_cobranca = null
    cobranca.regua_acordo = null
  }

  return cobranca
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
