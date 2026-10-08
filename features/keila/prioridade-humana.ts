import { formatarEmailAgente, type AgenteVirtualId } from '../agentes-virtuais/perfis'
import type { DecisaoObservacaoKeila } from './observacao'

// A resposta livre do modelo não pode reabrir uma negociação conduzida por humano.
export function aplicarPrioridadeHumana(
  decisao: DecisaoObservacaoKeila, nome = '', agora = new Date(), agenteId: AgenteVirtualId = 'keila',
): DecisaoObservacaoKeila {
  if (!decisao.negociacao_humana_outro_canal) return decisao
  return {
    ...decisao,
    classificacao: 'prioridade_humana',
    proxima_acao_simulada: 'Manter a negociação com o agente humano. Apenas agradecer o retorno e ficar à disposição, sem solicitar dados ou iniciar outra tratativa.',
    dados_faltantes: [],
    nao_deve_fazer: [...new Set([...decisao.nao_deve_fazer,
      'Não pedir unidade, comprovantes ou outras informações ao condômino.',
      'Não propor condições, solicitar boletos ou duplicar a negociação humana.',
    ])],
    resposta_simulada: formatarEmailAgente(agenteId, nome, 'Obrigada pelo retorno! Seguimos à disposição.', agora),
  }
}
