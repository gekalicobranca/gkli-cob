/** Política temporária P0. Retirar a suspensão somente com o commit transacional. */
export const EASY_CAP_CONFIRMATION_PAUSED = 'EASY_CAP_CONFIRMATION_PAUSED';
export const MENSAGEM_CAP_SUSPENSA = 'A confirmação da captação está temporariamente suspensa. Você pode ler o arquivo e conferir a prévia; a base de cobranças não será substituída por esta operação.';

// Inclui atenção: erro não comprova que a montagem ou liberação ficou sem efeito.
export const EASY_FLOW_ESTADOS_BLOQUEANTES = [
  'preview', 'montando', 'entre_partes', 'pronto', 'liberando', 'atencao',
] as const;

export function resultadoCaptacao(status: string) {
  if (['concluido', 'concluido_com_alertas'].includes(status)) return 'confirmado' as const;
  if (status === 'preview') return 'sem_aplicacao_confirmada' as const;
  // Não inferir ausência de efeito a partir de falha/cancelamento/estado desconhecido.
  return 'requer_conferencia' as const;
}
