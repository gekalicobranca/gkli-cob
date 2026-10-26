type Cobranca = { id: string; carteira_id: string; condominio_id: string; unidade_id: string };

export function selecionarCobrancaTitular<T extends Cobranca>(cobrancas: T[], titularId?: string, origemId?: string): T {
  const origem = cobrancas.find(c => c.id === origemId) ?? cobrancas[0];
  if (!origem) throw new Error('Selecione ao menos uma cobrança para o acordo.');
  if (cobrancas.some(c => c.carteira_id !== origem.carteira_id || c.condominio_id !== origem.condominio_id)) {
    throw new Error('O acordo só pode agrupar cobranças do mesmo condomínio e carteira.');
  }
  const unidades = new Set(cobrancas.map(c => c.unidade_id));
  if (unidades.size > 1 && !titularId) throw new Error('Escolha a unidade titular do acordo.');
  const titular = titularId ? cobrancas.find(c => c.unidade_id === titularId && c.id === origemId)
    ?? cobrancas.find(c => c.unidade_id === titularId) : origem;
  if (!titular) throw new Error('A unidade titular deve ter uma cobrança selecionada neste acordo.');
  return titular;
}

export function rotuloUnidade(unidade?: {identificacao?: string | null; bloco?: string | null} | null) {
  return `Unidade ${unidade?.identificacao ?? '-'}${unidade?.bloco ? ` · Bloco ${unidade.bloco}` : ''}`;
}
