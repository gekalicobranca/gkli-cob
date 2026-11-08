type Parcela = { status?: string | null; data_pagamento?: string | null };
export type AcordoEasy = {
  status?: string | null;
  tipo?: string | null;
  acordo_homologado?: boolean | null;
  exige_aprovacao_sindico?: boolean | null;
  sindico_aprovado_em?: string | null;
  parcelas?: Parcela[] | null;
};

export function acordoDisponivelEasy(acordo: AcordoEasy, operacao: string): boolean {
  if (operacao !== 'cancelar' && operacao !== 'efetivar') return true;
  if (['cancelado', 'quitado', 'rompido', 'quebrado', 'renegociado'].includes(acordo.status ?? '')) return false;
  if (operacao === 'cancelar') {
    return !(acordo.parcelas ?? []).some(parcela => parcela.data_pagamento ||
      ['paga', 'pago', 'quitada', 'quitado'].includes(String(parcela.status ?? '').toLowerCase()));
  }
  return acordo.tipo === 'extrajudicial' && !acordo.acordo_homologado &&
    !(acordo.exige_aprovacao_sindico && !acordo.sindico_aprovado_em);
}
