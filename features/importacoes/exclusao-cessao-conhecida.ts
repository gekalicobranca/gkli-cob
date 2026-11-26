import { identidadeRecibo } from './identidade-recibo';
const unidade = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/^0+/, '');
const bloco = (v: unknown) => String(v ?? '').trim().toUpperCase() || '0';
const chave = (condominio: unknown, u: unknown, b: unknown, recibo: string) => JSON.stringify([condominio, unidade(u), bloco(b), recibo.toUpperCase()]);

/** Recupera só a natureza já comprovada da mesma identidade; nenhum valor é copiado. */
export async function marcarCessaoDeOrigemConhecida<T extends Record<string, any>>(
  db: { rpc: (...args: any[]) => any }, linhas: T[], condominioId?: string,
): Promise<T[]> {
  const ids = [...new Set(linhas.map(l => condominioId ?? l.condominio_id).filter(Boolean))];
  if (!ids.length || !linhas.some(l => identidadeRecibo(l))) return linhas;
  const conhecidas = new Set<string>();
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await db.rpc('captacao_recibos_cessao_espaco', { p_condominios: ids }).range(inicio, inicio + 999);
    if (error) throw new Error('Não foi possível conferir exclusões de cessão/locação na origem. Nenhuma importação deve prosseguir.');
    for (const r of data ?? []) conhecidas.add(chave(r.condominio_id, r.unidade, r.bloco, r.recibo));
    if ((data ?? []).length < 1000) break;
  }
  return linhas.map(l => {
    const recibo = identidadeRecibo(l)?.recibo;
    return recibo && conhecidas.has(chave(condominioId ?? l.condominio_id, l.unidade ?? l.identificacao, l.bloco, recibo))
      ? { ...l, tiposCobranca: [...new Set([...(l.tiposCobranca ?? []), 'cessao_espaco'])],
        origemExclusaoCessao: 'Composição já comprovada no mesmo condomínio, unidade, bloco e recibo.' } : l;
  });
}
