type SupabaseLike = { from: (table: string) => any };

export type ItemImportacao = {
  id: string;
  linha: number;
  payload: Record<string, any>;
  valido: boolean;
  erros: string[];
  created_at: string;
};

/** Carrega o lote inteiro antes de permitir gravação ou conciliação de ausências. */
export async function carregarItensImportacao(
  supabase: SupabaseLike,
  importacaoId: string,
  options: { somenteValidos?: boolean; totalEsperado?: number } = {},
): Promise<ItemImportacao[]> {
  const rows: ItemImportacao[] = [];
  const ids = new Set<string>();
  let total = options.totalEsperado;
  for (;;) {
    let query = supabase.from('importacao_itens')
      .select('id, linha, payload, valido, erros, created_at', { count: 'exact' })
      .eq('importacao_id', importacaoId);
    if (options.somenteValidos) query = query.eq('valido', true);
    const { data, error, count } = await query
      .order('linha', { ascending: true }).order('id', { ascending: true })
      .range(rows.length, rows.length + 499);
    if (error) throw new Error(`Erro ao carregar itens da importação: ${error.message}`);
    if (typeof count !== 'number' || (total !== undefined && count !== total)) {
      throw new Error('Quantidade de itens da importação diverge da prévia. Gere uma nova prévia antes de confirmar.');
    }
    total = count;
    const page = (data ?? []) as ItemImportacao[];
    for (const item of page) {
      if (ids.has(item.id)) throw new Error('Itens repetidos durante a leitura da importação. Nenhuma gravação foi iniciada.');
      ids.add(item.id);
      rows.push(item);
    }
    if (rows.length === total) return rows;
    if (!page.length || rows.length > total) {
      throw new Error('Leitura incompleta dos itens da importação. Nenhuma gravação foi iniciada.');
    }
  }
}
