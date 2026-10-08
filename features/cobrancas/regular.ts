import type { SupabaseClient } from '@supabase/supabase-js'
export async function liberarCobrancasRegulares(db: SupabaseClient, carteiras: string[] | null, condominio?: string | null) {
  const { error } = await db.rpc('liberar_cobrancas_regulares', { p_carteiras: carteiras, p_condominio: condominio ?? null })
  if (error) throw new Error('Erro ao atualizar cobranças que atingiram a régua: ' + error.message)
}
