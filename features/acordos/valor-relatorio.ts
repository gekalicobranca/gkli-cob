import { acordoDuplicadoConciliado } from '@/lib/core/acordo-arquivamento'
/** Preserva valores históricos; exclui o nominal substituído ou duplicado das somas. */
export const EXCLUSAO_SUBSTITUICAO_PENDENTE = '[EXCLUIR_SOMA_DIVIDA_SUBSTITUICAO_PENDENTE]'
export function excluidoDaSomaDivida(row: { observacoes?: string | null }) {
  return acordoDuplicadoConciliado(row) || (row.observacoes ?? '').includes(EXCLUSAO_SUBSTITUICAO_PENDENTE)
}
export function valorAcordadoRelatorio(row: { valor_acordado?: unknown; observacoes?: string | null }) {
  return excluidoDaSomaDivida(row) ? 0 : Number(row.valor_acordado ?? 0)
}
