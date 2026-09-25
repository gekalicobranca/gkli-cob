export const TIPO_APROVACAO_FORA_REGUA = 'aprovacao_acordo_fora_regua';

export type FormularioPropostaForaRegua = Record<string, string> & {
  cotas_sem_despesas?: string;
};

export function propostaFinanceiraParaAprovacao(params: Record<string, unknown>) {
  return Object.fromEntries([
    'tipo', 'numero_processo', 'valor_acordado', 'entrada',
    'despesa_cobranca_percentual', 'despesa_cobranca_valor', 'itens', 'parcelas',
  ].map((key) => [key, params[`p_${key}`]]));
}

export function guardarFormularioProposta(formData: FormData): FormularioPropostaForaRegua {
  const campos = [
    'tipo', 'numero_processo', 'despesa_cobranca_percentual', 'entrada',
    'usar_credito_administradora', 'entrada_vencimento', 'quantidade_parcelas',
    'primeiro_vencimento', 'documento_url', 'observacoes', 'cota_mes_autorizada',
  ];
  return {
    ...Object.fromEntries(campos.map((key) => [key, String(formData.get(key) ?? '')])),
    cotas_sem_despesas: formData.getAll('cotas_sem_despesas').map(String).join(','),
  };
}
