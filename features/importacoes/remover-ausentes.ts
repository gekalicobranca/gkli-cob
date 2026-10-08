type SupabaseLike = { rpc: (name: string, params: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }> };

/** A RPC revalida o relatório, o status e os acordos dentro da mesma transação. */
export async function removerCobrancasAusentesDaImportacao(supabase: SupabaseLike, importacaoId: string) {
  const { data, error } = await supabase.rpc('importacao_remover_cobrancas_ausentes', { p_importacao: importacaoId });
  if (error) throw new Error(`Erro ao remover cobranças ausentes e seus vínculos nos flows: ${error.message}`);
  return data as { removidas: number; ids: string[]; mensagens_canceladas: number; itens_removidos: number; motivo?: string };
}
