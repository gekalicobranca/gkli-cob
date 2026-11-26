/** Regra de captação para todas as carteiras. Não lê nomes de pessoas/unidades. */
const TIPOS = new Set(['cessao_espaco', 'locacao_espaco', 'cessao_de_espaco', 'locacao_de_espaco']);
const CAMPOS = ['tipo', 'natureza', 'natureza_da_cobranca', 'tipo_cobranca', 'tipo_de_cobranca',
  'historico', 'descricao', 'observacoes', 'obs', 'detalhesOrigem', 'detalhes_origem'];
const normalizar = (v: unknown) => typeof v === 'string'
  ? v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim() : '';

export function origemTemCessaoEspaco(origem: unknown): boolean {
  if (!origem || typeof origem !== 'object' || Array.isArray(origem)) return false;
  const item = origem as Record<string, unknown>;
  const textoExcluido = (v: unknown) => {
    const texto = normalizar(v);
    return TIPOS.has(texto) || /\b(?:cessao|locacao|aluguel)\b.{0,100}\b(?:espaco|salao|area)\b/.test(texto);
  };
  if (CAMPOS.some(campo => textoExcluido(item[campo]))) return true;
  if (Array.isArray(item.tiposCobranca) && item.tiposCobranca.some(textoExcluido)) return true;
  if (Array.isArray(item.tipos_cobranca) && item.tipos_cobranca.some(textoExcluido)) return true;
  return ['composicaoOrigem', 'composicao_origem', 'parcelas'].some(campo =>
    Array.isArray(item[campo]) && (item[campo] as unknown[]).some(origemTemCessaoEspaco));
}

export const MOTIVO_EXCLUSAO_CESSAO = 'Cessão/locação de espaço fora da captação por regra operacional.';

/** Cabeçalhos já normalizados pelo parser XLSX oficial. */
export function naturezaDaLinhaPlanilha(raw: Record<string, unknown>) {
  const texto = (...campos: string[]) => campos.map(c => raw[c]).find(v => typeof v === 'string' && v.trim()) as string | undefined;
  return { natureza: texto('natureza','natureza_da_cobranca','tipo_cobranca','tipo_de_cobranca','tipo'),
    historico: texto('historico','historico_da_cobranca','descricao'),
    detalhesOrigem: texto('detalhes_origem','composicao_da_origem','composicao_origem') };
}

/** Preserva recibos originais para auditoria; nunca rateia um recibo misto. Idempotente. */
export function excluirCessaoEspacoDaPrevia<T extends { cobrancas: any[]; valorTotal: number; totalParcelas: number; inconsistencias: string[] }>(preview: T): T {
  const excluidas = preview.cobrancas.filter(origemTemCessaoEspaco);
  if (!excluidas.length) return preview;
  const cobrancas = preview.cobrancas.filter(item => !origemTemCessaoEspaco(item));
  const base = { ...preview } as T & { rankingMensal?: unknown; cobrancasRankingMensal?: any[] };
  delete base.rankingMensal;
  if (base.cobrancasRankingMensal) base.cobrancasRankingMensal = base.cobrancasRankingMensal.filter(i => !origemTemCessaoEspaco(i));
  const anterior = preview as T & { exclusaoCessaoEspaco?: { versao: number; recibos: unknown[]; valorTotalOrigem: number } };
  return { ...base, cobrancas,
    valorTotal: cobrancas.reduce((s, c) => s + Math.round(Number(c.valorTotal) * 100), 0) / 100,
    totalParcelas: cobrancas.reduce((s, c) => s + (c.parcelas?.length ?? 0), 0),
    exclusaoCessaoEspaco: { versao: 1, valorTotalOrigem: anterior.exclusaoCessaoEspaco?.valorTotalOrigem ?? preview.valorTotal,
      recibos: [...(anterior.exclusaoCessaoEspaco?.recibos ?? []), ...excluidas] },
    inconsistencias: [...preview.inconsistencias.filter(t => !t.endsWith(MOTIVO_EXCLUSAO_CESSAO)),
      `${(anterior.exclusaoCessaoEspaco?.recibos.length ?? 0) + excluidas.length} recibo(s): ${MOTIVO_EXCLUSAO_CESSAO}`],
  };
}
