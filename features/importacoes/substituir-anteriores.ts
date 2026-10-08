type SupabaseLike = { rpc: (name: string, params: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }> };

/** Remove a carga anterior e seus vínculos nos flows na mesma transação. */
export async function substituirCobrancasAnterioresDaImportacao(supabase: SupabaseLike, importacaoId: string) {
  const { data, error } = await supabase.rpc('importacao_substituir_cobrancas_anteriores', { p_importacao: importacaoId });
  if (error) throw new Error(`Erro ao substituir cobranças anteriores e seus vínculos nos flows: ${error.message}`);
  return data as { removidas: number; ids: string[]; mensagens_canceladas: number; itens_removidos: number };
}
