export async function captacaoGlobalAtiva(supabase) {
  const { data, error } = await supabase.from('automacao_controle')
    .select('ativo').eq('chave', 'captacao_global').maybeSingle()
  if (error) throw new Error(`Falha ao consultar o controle global da captação: ${error.message}`)
  return data?.ativo !== false
}
