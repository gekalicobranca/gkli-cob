/** Exclui somente o valor nominal, nunca recebimentos ou linhas históricas. */
export const EXCLUSAO_SUBSTITUICAO_PENDENTE = '[EXCLUIR_SOMA_DIVIDA_SUBSTITUICAO_PENDENTE]'
export function excluidoDaSomaDivida(row: { observacoes?: string | null }) {
  return (row.observacoes ?? '').includes(EXCLUSAO_SUBSTITUICAO_PENDENTE)
}
export function valorAcordadoRelatorio(row: { valor_acordado?: unknown; observacoes?: string | null }) {
  return excluidoDaSomaDivida(row) ? 0 : Number(row.valor_acordado ?? 0)
}
