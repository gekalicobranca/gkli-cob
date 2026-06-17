import { createAdminClient } from '@/utils/supabase/admin'
import { applyCarteiraScopeWithGlobal } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import type { ReguaEtapaResumo, ReguaResumo, ReguaTipo } from './types'
export type { ReguaEtapaResumo } from './types'

const REGUA_SELECT = `
  id,
  carteira_id,
  nome,
  tipo,
  status,
  descricao,
  prioridade,
  padrao,
  ativo,
  created_at,
  updated_at,
  carteiras(nome)
`

export async function listReguasOperacionais(scope: CarteiraScope, tipo?: ReguaTipo | null): Promise<ReguaResumo[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('reguas')
    .select(REGUA_SELECT)
    .order('tipo', { ascending: true })
    .order('prioridade', { ascending: false })
    .order('nome', { ascending: true })

  query = applyCarteiraScopeWithGlobal(query, scope)
  if (tipo) query = query.eq('tipo', tipo)

  const { data, error } = await query

  if (error) {
    if (error.code === '42P01') return []
    throw new Error(`Erro ao carregar réguas: ${error.message}`)
  }

  return (data ?? []) as any[]
}

export async function getReguaOperacional(id: string, scope: CarteiraScope): Promise<ReguaResumo | null> {
  const supabase = createAdminClient()

  let query = supabase
    .from('reguas')
    .select(`${REGUA_SELECT}, etapas:regua_etapas(id, regua_id, ordem, nome, delay_dias, delay_referencia, canal, template, template_id, categoria_template, tom, horario_inicio, horario_fim, acao, ativo)`)
    .eq('id', id)
    .maybeSingle()

  query = applyCarteiraScopeWithGlobal(query, scope)

  const { data, error } = await query

  if (error) {
    if (error.code === '42P01') return null
    throw new Error(`Erro ao carregar régua: ${error.message}`)
  }

  if (!data) return null
  const regua = data as any
  regua.etapas = [...(regua.etapas ?? [])].sort((a: any, b: any) => Number(a.ordem) - Number(b.ordem))
  return regua as ReguaResumo
}

export async function listReguasForSelect(scope: CarteiraScope, tipo: ReguaTipo) {
  const rows = await listReguasOperacionais(scope, tipo)
  return rows.filter((row) => row.ativo !== false && row.status !== 'inativa')
}


// Compatibilidade com telas antigas de Mensageria que ainda importam etapas diretamente.
// A listagem operacional nova usa `listReguasOperacionais`, mas este alias evita quebra
// de build enquanto todas as telas são migradas para o novo modelo.
export async function listReguaEtapas(): Promise<ReguaEtapaResumo[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('regua_etapas')
    .select('id, regua_id, template_id, template, nome, ordem, canal, ativo')
    .order('ordem', { ascending: true })

  if (error) {
    if (error.code === '42P01') return []
    throw new Error(`Erro ao carregar etapas das réguas: ${error.message}`)
  }

  return (data ?? []) as ReguaEtapaResumo[]
}
