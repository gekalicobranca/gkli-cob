/** Associa um débito já conciliado à captação atual sem alterar valores ou status. */
export async function associarCobrancaConciliada(db: { from: (table: string) => any },
  id: string, contexto: { condominio_id: string; unidade_id: string; conversao_relatorio_id?: string; carteira_id?: string }) {
  if (!contexto.conversao_relatorio_id) return;
  let query = db.from('cobrancas').update({ conversao_relatorio_id: contexto.conversao_relatorio_id })
    .eq('id', id).eq('condominio_id', contexto.condominio_id).eq('unidade_id', contexto.unidade_id).is('duplicada_de_id', null);
  if (contexto.carteira_id) query = query.eq('carteira_id', contexto.carteira_id);
  const { data, error } = await query.select('id');
  if (error || data?.length !== 1) throw new Error('Não foi possível reaproveitar a cobrança conciliada na conversão atual.');
}
