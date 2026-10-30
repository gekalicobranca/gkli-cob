import { resolveFiltrosStatus } from './filtros-status'

export function filtrosRelatorioCobrancas(params: URLSearchParams) {
  const get = (key: string) => (params.get(key) ?? '').trim()
  return {
    search: get('q'), operadorId: get('operador_id'),
    administradoraId: get('administradora_id'), condominioId: get('condominio_id'), unidadeId: get('unidade_id'),
    conducaoProcesso: get('conducao_processo'),
    ...resolveFiltrosStatus(get('status'), ['nosso_escritorio', 'outro_advogado'].includes(get('conducao_processo')) ? 'sim' : get('judicializacao_unidade')),
    vencimentoDe: get('vencimento_de'), vencimentoAte: get('vencimento_ate'),
    criacaoDe: get('criacao_de'), criacaoAte: get('criacao_ate'),
    ordenar: get('ordenar') || 'vencimento_asc',
  }
}
