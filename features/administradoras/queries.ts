import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole } from '@/utils/auth/require-role'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import type { Administradora, AdministradoraContato, AdministradoraMetricas, SolicitacaoAdministradora, TemplateMensageriaAdm } from './types'

const PAGE_SIZE = 500
const LIST_COLUMNS = 'id,carteira_id,nome,nome_operacional,cnpj,telefone,email,site,status,acesso_gerar_acordo,responsavel_interno,observacoes,created_at,updated_at'

type Filters = { search?: string | null; status?: string | null; acessoAcordo?: string | null }
export type AdministradoraOrder = 'nome' | 'status' | 'acesso_acordo' | 'contato'

export function normalizeAdmFilters(input: Record<string, string | null | undefined>): Filters {
  return {
    search: input.search?.trim() || null,
    status: input.status?.trim() || null,
    acessoAcordo: input.acessoAcordo?.trim() || null,
  }
}

function applyFilters(query: any, filters: Filters) {
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.acessoAcordo === 'sim') query = query.eq('acesso_gerar_acordo', true)
  if (filters.acessoAcordo === 'nao') query = query.or('acesso_gerar_acordo.eq.false,acesso_gerar_acordo.is.null')
  if (filters.search) {
    const term = filters.search.replace(/[%_]/g, '')
    query = query.or(`nome.ilike.%${term}%,nome_operacional.ilike.%${term}%,cnpj.ilike.%${term}%,email.ilike.%${term}%`)
  }
  return query
}

function applyOrder(query: any, order: AdministradoraOrder) {
  if (order === 'status') return query.order('status', { ascending: true }).order('nome', { ascending: true })
  if (order === 'acesso_acordo') return query.order('acesso_gerar_acordo', { ascending: false }).order('nome', { ascending: true })
  if (order === 'contato') return query.order('email', { ascending: true, nullsFirst: false }).order('telefone', { ascending: true, nullsFirst: false }).order('nome', { ascending: true })
  return query.order('nome_operacional', { ascending: true, nullsFirst: false }).order('nome', { ascending: true })
}

async function readAllPages<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
) {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`Erro ao carregar ${label}: ${error.message}`)
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

export async function listAdministradoras(filters: Filters = {}) {
  await requireRole(['admin', 'gestor', 'operador', 'leitura'])
  const supabase = createAdminClient()
  return readAllPages<Administradora>(
    (from, to) => applyFilters(supabase.from('administradoras').select(LIST_COLUMNS), filters)
      .order('nome', { ascending: true }).order('id', { ascending: true }).range(from, to),
    'administradoras',
  )
}

export async function listAdministradorasPage(
  filters: Filters = {},
  options: { page?: number; pageSize?: number; order?: AdministradoraOrder } = {},
) {
  await requireRole(['admin', 'gestor', 'operador', 'leitura'])
  const supabase = createAdminClient()
  const page = Math.max(1, Math.floor(Number(options.page) || 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(options.pageSize) || 50)))
  const from = (page - 1) * pageSize
  const pageQuery = applyOrder(
    applyFilters(supabase.from('administradoras').select(LIST_COLUMNS, { count: 'exact' }), filters),
    options.order ?? 'nome',
  ).order('id', { ascending: true }).range(from, from + pageSize - 1)
  const activeCountQuery = applyFilters(
    supabase.from('administradoras').select('id', { count: 'exact', head: true }),
    { ...filters, status: 'ativo' },
  )
  const [{ data, error, count }, { count: activeTotal, error: activeError }] = await Promise.all([pageQuery, activeCountQuery])

  if (error) throw new Error(`Erro ao carregar administradoras: ${error.message}`)
  if (count === null) throw new Error('Não foi possível contar as administradoras filtradas.')
  if (activeError) throw new Error(`Erro ao contar administradoras ativas: ${activeError.message}`)
  if (activeTotal === null) throw new Error('Não foi possível contar as administradoras ativas.')

  const lastPage = Math.max(1, Math.ceil(count / pageSize))
  if (page > lastPage) {
    return listAdministradorasPage(filters, { ...options, page: lastPage, pageSize })
  }

  return { rows: (data ?? []) as Administradora[], total: count, activeTotal, page, pageSize }
}

export async function getAdministradora(id: string) {
  await requireRole(['admin', 'gestor', 'operador', 'leitura'])
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('administradoras').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`Erro ao carregar administradora: ${error.message}`)
  return data as Administradora | null
}

export async function listContatosAdministradora(administradoraId: string) {
  await requireRole(['admin', 'gestor', 'operador', 'leitura'])
  const supabase = createAdminClient()
  return readAllPages<AdministradoraContato>(
    (from, to) => supabase.from('administradora_contatos').select('*').eq('administradora_id', administradoraId)
      .order('principal', { ascending: false }).order('nome', { ascending: true }).order('id', { ascending: true }).range(from, to),
    'contatos da administradora',
  )
}

export async function listSolicitacoesAdministradora(administradoraId?: string) {
  await requireRole(['admin', 'gestor', 'operador', 'leitura'])
  const supabase = createAdminClient()
  return readAllPages<SolicitacaoAdministradora>(
    (from, to) => {
      let query = supabase.from('solicitacoes_administradora')
        .select('*, administradoras(nome), administradora_contatos(nome,email,whatsapp)')
        .order('created_at', { ascending: false }).order('id', { ascending: false })
      if (administradoraId) query = query.eq('administradora_id', administradoraId)
      return query.range(from, to)
    },
    'solicitações de administradora',
  )
}

export async function listTemplatesAdm() {
  await requireRole(['admin', 'gestor', 'operador', 'leitura'])
  const supabase = createAdminClient()
  return readAllPages<TemplateMensageriaAdm>(
    (from, to) => supabase.from('templates_mensageria_adm').select('*')
      .order('tipo', { ascending: true }).order('nome', { ascending: true }).order('id', { ascending: true }).range(from, to),
    'templates de administradora',
  )
}

export async function getMetricasAdministradora(administradoraId: string): Promise<AdministradoraMetricas> {
  const solicitacoes = await listSolicitacoesAdministradora(administradoraId)
  const contatos = await listContatosAdministradora(administradoraId)
  const agora = Date.now()
  const abertas = solicitacoes.filter((s) => !['resolvido', 'cancelado'].includes(String(s.status)))
  const atrasadas = abertas.filter((s) => s.prazo_resposta && new Date(s.prazo_resposta).getTime() < agora)
  const resolvidas = solicitacoes.filter((s) => s.status === 'resolvido' || s.data_resposta)
  const tempos = resolvidas
    .map((s) => {
      if (!s.created_at || !s.data_resposta) return null
      return (new Date(s.data_resposta).getTime() - new Date(s.created_at).getTime()) / 36e5
    })
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0)

  return {
    contatosAtivos: contatos.filter((c) => c.ativo !== false).length,
    solicitacoesAbertas: abertas.length,
    solicitacoesAtrasadas: atrasadas.length,
    solicitacoesResolvidas: resolvidas.length,
    tempoMedioRespostaHoras: tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null,
  }
}

export async function listCondominiosVinculados(administradoraId: string) {
  await requireRole(['admin', 'gestor', 'operador', 'leitura'])
  const scope = await getPermittedCarteiras()
  if (!scope.isAdmin && !scope.carteiraIds?.length) return []
  const supabase = createAdminClient()
  return readAllPages<{ id: string; nome?: string | null; cnpj?: string | null; status?: string | null; carteira_id?: string | null }>(
    (from, to) => {
      let query = supabase.from('condominios').select('id,nome,cnpj,status,carteira_id')
        .eq('administradora_id', administradoraId)
      if (!scope.isAdmin && scope.carteiraIds) query = query.in('carteira_id', scope.carteiraIds)
      return query.order('nome', { ascending: true }).order('id', { ascending: true }).range(from, to)
    },
    'condomínios vinculados',
  )
}
