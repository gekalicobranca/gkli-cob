import type { createAdminClient } from '@/utils/supabase/admin'

export async function unidadesComMinimoPreJuridico(
  db: ReturnType<typeof createAdminClient>,
  ids: Array<string | null | undefined>,
) {
  const unidades = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  const elegiveis = new Set<string>()
  for (let inicio = 0; inicio < unidades.length; inicio += 200) {
    const { data, error } = await db.rpc('pre_juridico_unidades_com_minimo', {
      p_unidades: unidades.slice(inicio, inicio + 200),
    })
    if (error) throw new Error(`Erro ao conferir o mínimo de cotas em atraso: ${error.message}`)
    for (const id of data ?? []) elegiveis.add(id)
  }
  return elegiveis
}
