export type AgreementKind = 'judicial' | 'extrajudicial'

export function isJudicialUnderReview(row: { tipo?: string | null; fluxo_status?: string | null }) {
  return row.tipo === 'judicial' && row.fluxo_status === 'rascunho'
}

// Legacy agreements without an explicit kind retain their extrajudicial scope.
export function matchesAgreementKind(row: { tipo?: string | null }, kind: AgreementKind) {
  return (row.tipo ?? 'extrajudicial') === kind
}

export function applyAgreementKind<T extends { eq(column: string, value: string): T; or(filter: string): T }>(query: T, kind: AgreementKind) {
  return kind === 'judicial' ? query.eq('tipo', 'judicial') : query.or('tipo.eq.extrajudicial,tipo.is.null')
}
