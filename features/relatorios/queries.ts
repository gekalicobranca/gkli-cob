import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import type { RelatorioFilters, RelatorioLinha, RelatorioResumo, RelatorioTipo } from './types'

type RowMap = Map<string, RelatorioLinha>

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function money(value: unknown) {
  return Number(value ?? 0) || 0
}

function safeText(value: unknown, fallback = '-') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeOrderDir(value?: string): 'asc' | 'desc' {
  return value === 'desc' ? 'desc' : 'asc'
}

function emptyLine(id: string, titulo: string): RelatorioLinha {
  return {
    id,
    titulo,
    condominios: 0,
    registros: 0,
    valorOriginal: 0,
    valorAtualizado: 0,
    valorAcordado: 0,
    ativos: 0,
    inativos: 0,
    suspensos: 0,
    statusAberto: 0,
    statusNegociacao: 0,
    statusAcordo: 0,
    statusSuspenso: 0,
    detalhe: [],
  }
}

function getOrCreate(map: RowMap, id: string, titulo: string) {
  const current = map.get(id)
  if (current) return current
  const created = emptyLine(id, titulo)
  map.set(id, created)
  return created
}

function relation<T = any>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return (value[0] ?? null) as T | null
  return (value ?? null) as T | null
}

function statusBucket(status: unknown) {
  const value = normalize(status)
  if (['suspenso', 'suspensa', 'suspensa_operacional'].some((item) => value.includes(item))) return 'suspenso'
  if (value.includes('acordo')) return 'acordo'
  if (value.includes('negoci')) return 'negociacao'
  return 'aberto'
}

function applySearch(rows: RelatorioLinha[], q?: string) {
  const search = normalize(q)
  if (!search) return rows
  return rows.filter((row) => {
    const haystack = normalize([
      row.titulo,
      row.subtitulo,
      row.carteira,
      row.administradora,
      ...row.detalhe.flatMap((item) => [item.titulo, item.subtitulo, item.carteira, item.administradora, item.status]),
    ].join(' '))

    return haystack.includes(search)
  })
}

function sortRows(rows: RelatorioLinha[], filters: RelatorioFilters) {
  const dir = normalizeOrderDir(filters.orderDir) === 'desc' ? -1 : 1
  const orderBy = filters.orderBy || 'titulo'

  return [...rows].sort((a, b) => {
    let result = 0

    switch (orderBy) {
      case 'condominios':
        result = a.condominios - b.condominios
        break
      case 'registros':
        result = a.registros - b.registros
        break
      case 'valor_original':
        result = a.valorOriginal - b.valorOriginal
        break
      case 'valor_atualizado':
        result = a.valorAtualizado - b.valorAtualizado
        break
      case 'valor_acordado':
        result = a.valorAcordado - b.valorAcordado
        break
      case 'carteira':
        result = normalize(a.carteira).localeCompare(normalize(b.carteira), 'pt-BR', { numeric: true })
        break
      case 'administradora':
        result = normalize(a.administradora).localeCompare(normalize(b.administradora), 'pt-BR', { numeric: true })
        break
      case 'titulo':
      default:
        result = normalize(a.titulo).localeCompare(normalize(b.titulo), 'pt-BR', { numeric: true })
    }

    if (result !== 0) return result * dir
    return normalize(a.titulo).localeCompare(normalize(b.titulo), 'pt-BR', { numeric: true })
  })
}

function buildResumo(rows: RelatorioLinha[]): RelatorioResumo {
  return rows.reduce(
    (acc, row) => ({
      grupos: acc.grupos + 1,
      condominios: acc.condominios + row.condominios,
      registros: acc.registros + row.registros,
      valor: acc.valor + row.valorOriginal + row.valorAcordado,
    }),
    { grupos: 0, condominios: 0, registros: 0, valor: 0 },
  )
}

async function listCondominios(scope: CarteiraScope, filters: RelatorioFilters) {
  const supabase = await createClient()
  let query = supabase
    .from('condominios')
    .select('id, nome, nome_operacional, cnpj, administradora, status, carteira_id, carteiras(nome)')
    .order('nome')

  query = applyCarteiraScope(query, scope.carteiraIds)

  if (filters.carteiraId) query = query.eq('carteira_id', filters.carteiraId)
  if (filters.status) query = query.eq('status', filters.status)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar condomínios do relatório: ${error.message}`)
  return (data ?? []) as any[]
}

async function listCobrancas(scope: CarteiraScope, filters: RelatorioFilters) {
  const supabase = await createClient()
  let query = supabase
    .from('cobrancas')
    .select(`
      id,
      carteira_id,
      condominio_id,
      vencimento,
      valor_original,
      valor_atualizado,
      status,
      status_operacional,
      condominios(id, nome, nome_operacional, cnpj, administradora, status, carteiras(nome)),
      unidades(identificacao, bloco, responsavel_nome)
    `)
    .order('vencimento', { ascending: true })

  query = applyCarteiraScope(query, scope.carteiraIds)
  if (filters.carteiraId) query = query.eq('carteira_id', filters.carteiraId)
  if (filters.status) query = query.or(`status.eq.${filters.status},status_operacional.eq.${filters.status}`)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar cobranças do relatório: ${error.message}`)
  return (data ?? []) as any[]
}

async function listAcordos(scope: CarteiraScope, filters: RelatorioFilters) {
  const supabase = await createClient()
  let query = supabase
    .from('acordos')
    .select(`
      id,
      carteira_id,
      condominio_id,
      unidade_id,
      tipo,
      status,
      data_acordo,
      valor_acordado,
      entrada,
      condominios(id, nome, nome_operacional, cnpj, administradora, status, carteiras(nome)),
      unidades(identificacao, bloco, responsavel_nome)
    `)
    .order('data_acordo', { ascending: false })

  query = applyCarteiraScope(query, scope.carteiraIds)
  if (filters.carteiraId) query = query.eq('carteira_id', filters.carteiraId)
  if (filters.status) query = query.eq('status', filters.status)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar acordos do relatório: ${error.message}`)
  return (data ?? []) as any[]
}

export async function getRelatorioCarteirasCondominios(scope: CarteiraScope, filters: RelatorioFilters) {
  const condominios = await listCondominios(scope, filters)
  const map: RowMap = new Map()

  for (const condominio of condominios) {
    const carteira = relation<any>(condominio.carteiras)
    const carteiraNome = safeText(carteira?.nome, 'Sem carteira')
    const row = getOrCreate(map, String(condominio.carteira_id ?? 'sem-carteira'), carteiraNome)
    row.subtitulo = 'Carteira operacional'
    row.carteira = carteiraNome
    row.condominios += 1
    row.registros += 1

    const status = normalize(condominio.status)
    if (status === 'ativo') row.ativos += 1
    else if (status === 'suspenso') row.suspensos += 1
    else row.inativos += 1

    row.detalhe.push({
      id: condominio.id,
      titulo: safeText(condominio.nome_operacional || condominio.nome, 'Condomínio sem nome'),
      subtitulo: `CNPJ ${safeText(condominio.cnpj)} · ${safeText(condominio.administradora, 'Sem administradora')}`,
      carteira: carteiraNome,
      administradora: condominio.administradora,
      status: condominio.status,
    })
  }

  const rows = sortRows(applySearch(Array.from(map.values()), filters.q), filters)
  return { rows, resumo: buildResumo(rows) }
}

export async function getRelatorioCondominiosAdministradoras(scope: CarteiraScope, filters: RelatorioFilters) {
  const condominios = await listCondominios(scope, filters)
  const map: RowMap = new Map()

  for (const condominio of condominios) {
    const administradora = safeText(condominio.administradora, 'Sem administradora')
    const carteira = relation<any>(condominio.carteiras)
    const carteiraNome = safeText(carteira?.nome, 'Sem carteira')
    const row = getOrCreate(map, normalize(administradora) || 'sem-administradora', administradora)
    row.subtitulo = 'Administradora vinculada'
    row.administradora = administradora
    row.condominios += 1
    row.registros += 1

    const status = normalize(condominio.status)
    if (status === 'ativo') row.ativos += 1
    else if (status === 'suspenso') row.suspensos += 1
    else row.inativos += 1

    row.detalhe.push({
      id: condominio.id,
      titulo: safeText(condominio.nome_operacional || condominio.nome, 'Condomínio sem nome'),
      subtitulo: `CNPJ ${safeText(condominio.cnpj)}`,
      carteira: carteiraNome,
      administradora,
      status: condominio.status,
    })
  }

  const rows = sortRows(applySearch(Array.from(map.values()), filters.q), filters)
  return { rows, resumo: buildResumo(rows) }
}

export async function getRelatorioCondominiosCobrancas(scope: CarteiraScope, filters: RelatorioFilters) {
  const cobrancas = await listCobrancas(scope, filters)
  const map: RowMap = new Map()

  for (const cobranca of cobrancas) {
    const condominio = relation<any>(cobranca.condominios)
    const carteira = relation<any>(condominio?.carteiras)
    const unidade = relation<any>(cobranca.unidades)
    const condominioId = String(condominio?.id ?? cobranca.condominio_id ?? 'sem-condominio')
    const row = getOrCreate(map, condominioId, safeText(condominio?.nome_operacional || condominio?.nome, 'Sem condomínio'))
    row.subtitulo = `CNPJ ${safeText(condominio?.cnpj)} · ${safeText(condominio?.administradora, 'Sem administradora')}`
    row.carteira = safeText(carteira?.nome, 'Sem carteira')
    row.administradora = condominio?.administradora
    row.condominios = 1
    row.registros += 1
    row.valorOriginal += money(cobranca.valor_original)
    row.valorAtualizado += money(cobranca.valor_atualizado)

    const bucket = statusBucket(cobranca.status_operacional ?? cobranca.status)
    if (bucket === 'suspenso') row.statusSuspenso += 1
    else if (bucket === 'acordo') row.statusAcordo += 1
    else if (bucket === 'negociacao') row.statusNegociacao += 1
    else row.statusAberto += 1

    row.detalhe.push({
      id: cobranca.id,
      titulo: [unidade?.bloco, unidade?.identificacao].filter(Boolean).join(' · ') || 'Unidade não informada',
      subtitulo: safeText(unidade?.responsavel_nome, 'Responsável não informado'),
      carteira: row.carteira,
      administradora: row.administradora,
      status: cobranca.status_operacional ?? cobranca.status,
      vencimento: cobranca.vencimento,
      valor: money(cobranca.valor_original),
      valorAtualizado: money(cobranca.valor_atualizado),
    })
  }

  const rows = sortRows(applySearch(Array.from(map.values()), filters.q), filters)
  return { rows, resumo: buildResumo(rows) }
}

export async function getRelatorioCondominiosAcordos(scope: CarteiraScope, filters: RelatorioFilters) {
  const acordos = await listAcordos(scope, filters)
  const map: RowMap = new Map()

  for (const acordo of acordos) {
    const condominio = relation<any>(acordo.condominios)
    const carteira = relation<any>(condominio?.carteiras)
    const unidade = relation<any>(acordo.unidades)
    const condominioId = String(condominio?.id ?? acordo.condominio_id ?? 'sem-condominio')
    const row = getOrCreate(map, condominioId, safeText(condominio?.nome_operacional || condominio?.nome, 'Sem condomínio'))
    row.subtitulo = `CNPJ ${safeText(condominio?.cnpj)} · ${safeText(condominio?.administradora, 'Sem administradora')}`
    row.carteira = safeText(carteira?.nome, 'Sem carteira')
    row.administradora = condominio?.administradora
    row.condominios = 1
    row.registros += 1
    row.valorAcordado += money(acordo.valor_acordado)

    const bucket = statusBucket(acordo.status)
    if (bucket === 'suspenso') row.statusSuspenso += 1
    else if (bucket === 'acordo') row.statusAcordo += 1
    else if (bucket === 'negociacao') row.statusNegociacao += 1
    else row.statusAberto += 1

    row.detalhe.push({
      id: acordo.id,
      titulo: [unidade?.bloco, unidade?.identificacao].filter(Boolean).join(' · ') || 'Unidade não informada',
      subtitulo: safeText(unidade?.responsavel_nome, 'Responsável não informado'),
      carteira: row.carteira,
      administradora: row.administradora,
      status: acordo.status,
      vencimento: acordo.data_acordo,
      valor: money(acordo.valor_acordado),
      tipo: acordo.tipo,
    })
  }

  const rows = sortRows(applySearch(Array.from(map.values()), filters.q), filters)
  return { rows, resumo: buildResumo(rows) }
}

export async function getRelatorio(tipo: RelatorioTipo, scope: CarteiraScope, filters: RelatorioFilters) {
  switch (tipo) {
    case 'carteiras-condominios':
      return getRelatorioCarteirasCondominios(scope, filters)
    case 'condominios-administradoras':
      return getRelatorioCondominiosAdministradoras(scope, filters)
    case 'condominios-cobrancas':
      return getRelatorioCondominiosCobrancas(scope, filters)
    case 'condominios-acordos':
      return getRelatorioCondominiosAcordos(scope, filters)
    default:
      return getRelatorioCarteirasCondominios(scope, filters)
  }
}
