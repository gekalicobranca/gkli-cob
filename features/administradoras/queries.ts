import { createAdminClient } from '@/utils/supabase/admin'
import type { Administradora, AdministradoraContato, AdministradoraMetricas, SolicitacaoAdministradora, TemplateMensageriaAdm } from './types'

type Scope = { permittedCarteiraIds?: string[] | null; carteiraIds?: string[] | null; isAdmin?: boolean }
type Filters = { search?: string | null; status?: string | null; carteiraId?: string | null }

function applyCarteira(query: any, scope?: Scope, column = 'carteira_id') {
  if (scope?.isAdmin) return query
  const ids = (scope?.permittedCarteiraIds ?? scope?.carteiraIds ?? [])?.filter(Boolean) ?? []
  if (ids.length === 0) return query
  return query.in(column, ids)
}

export function normalizeAdmFilters(input: Record<string, string | null | undefined>): Filters {
  return {
    search: input.search?.trim() || null,
    status: input.status?.trim() || null,
    carteiraId: input.carteiraId?.trim() || null,
  }
}

export async function listAdministradoras(scope?: Scope, filters: Filters = {}) {
  const supabase = createAdminClient()
  let query = supabase
    .from('administradoras')
    .select('*')
    .order('nome', { ascending: true })
    .limit(200)

  query = applyCarteira(query, scope)

  if (filters.carteiraId) query = query.eq('carteira_id', filters.carteiraId)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.search) {
    const term = filters.search.replace(/[%_]/g, '')
    query = query.or(`nome.ilike.%${term}%,nome_operacional.ilike.%${term}%,cnpj.ilike.%${term}%,email.ilike.%${term}%`)
  }

  const { data, error } = await query
  if (error) return [] as Administradora[]
  return (data ?? []) as Administradora[]
}

export async function getAdministradora(id: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('administradoras').select('*').eq('id', id).maybeSingle()
  if (error) return null
  return data as Administradora | null
}

export async function listContatosAdministradora(administradoraId: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('administradora_contatos')
    .select('*')
    .eq('administradora_id', administradoraId)
    .order('principal', { ascending: false })
    .order('nome', { ascending: true })
  if (error) return [] as AdministradoraContato[]
  return (data ?? []) as AdministradoraContato[]
}

export async function listSolicitacoesAdministradora(administradoraId?: string) {
  const supabase = createAdminClient()
  let query = supabase
    .from('solicitacoes_administradora')
    .select('*, administradoras(nome), administradora_contatos(nome,email,whatsapp)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (administradoraId) query = query.eq('administradora_id', administradoraId)
  const { data, error } = await query
  if (error) return [] as SolicitacaoAdministradora[]
  return (data ?? []) as SolicitacaoAdministradora[]
}

export async function listTemplatesAdm() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('templates_mensageria_adm')
    .select('*')
    .order('tipo', { ascending: true })
    .order('nome', { ascending: true })
  if (error) return [] as TemplateMensageriaAdm[]
  return (data ?? []) as TemplateMensageriaAdm[]
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
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('condominios')
    .select('id,nome,cnpj,status,carteira_id')
    .eq('administradora_id', administradoraId)
    .order('nome', { ascending: true })
    .limit(50)
  if (error) return [] as Array<{ id: string; nome?: string | null; cnpj?: string | null; status?: string | null }>
  return data ?? []
}
