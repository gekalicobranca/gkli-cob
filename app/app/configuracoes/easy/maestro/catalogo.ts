import 'server-only'
import { createAdminClient } from '@/utils/supabase/admin'

export async function listarAdministradoras(carteiras: string[] | null) {
  const client = createAdminClient()
  const opcoes = new Map<string, string>()
  const tamanho = 500
  for (let inicio = 0; ; inicio += tamanho) {
    const { data, error } = await client.rpc('easy_maestro_receitas', {
      p_carteiras: carteiras,
      p_administradora: null,
    }).select('administradora,administradora_nome').order('receita_id').range(inicio, inicio + tamanho - 1)
    if (error || !Array.isArray(data)) throw new Error('Falha ao listar administradoras.')
    for (const linha of data) opcoes.set(linha.administradora, linha.administradora_nome)
    if (data.length < tamanho) break
  }
  return [...opcoes].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
}
