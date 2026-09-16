import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

export async function listOperadoresCadastro(): Promise<{ id: string; nome: string }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_operadores_cadastro')
  if (error) throw new Error(`Erro ao carregar operadores: ${error.message}`)
  return data ?? []
}

export async function listGruposCondominios(scope: CarteiraScope): Promise<string[]> {
  const supabase = await createClient()
  const grupos = new Set<string>()
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await applyCarteiraScope(
      supabase.from('condominios').select('id, grupo').not('grupo', 'is', null).order('id'), scope.carteiraIds,
    ).range(offset, offset + 499)
    if (error) throw new Error(`Erro ao carregar grupos: ${error.message}`)
    for (const row of data ?? []) grupos.add(row.grupo)
    if ((data ?? []).length < 500) break
  }
  return [...grupos].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
