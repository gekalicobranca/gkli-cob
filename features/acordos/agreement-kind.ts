export type AgreementKind = 'judicial' | 'extrajudicial'

// Legacy agreements without an explicit kind retain their extrajudicial scope.
export function matchesAgreementKind(row: { tipo?: string | null }, kind: AgreementKind) {
  return (row.tipo ?? 'extrajudicial') === kind
}

export function applyAgreementKind<T extends { eq(column: string, value: string): T; or(filter: string): T }>(query: T, kind: AgreementKind) {
  return kind === 'judicial' ? query.eq('tipo', 'judicial') : query.or('tipo.eq.extrajudicial,tipo.is.null')
}
