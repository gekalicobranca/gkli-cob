import type { AgreementKind } from './agreement-kind'

export function filtrosRelatorioAcordos(params: URLSearchParams) {
  const get = (key: string) => (params.get(key) ?? '').trim()
  return {
    q: get('q'), condominio_id: get('condominio_id'), unidade_id: get('unidade_id'),
    carteira_id: get('carteira_id'), status: get('status'),
    data_de: get('data_de'), data_ate: get('data_ate'),
    criacao_de: get('criacao_de'), criacao_ate: get('criacao_ate'), operador_id: get('operador_id'),
    ordenar: get('ordenar') || 'data_desc',
    tipo_acordo: (get('tipo_acordo') === 'judicial' ? 'judicial' : 'extrajudicial') as AgreementKind,
  }
}
