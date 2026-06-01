export const OPERATIONAL_IMPORT_TYPES = ['condominios', 'unidades', 'cobrancas'] as const
export const LEGACY_IMPORT_TYPES = ['acordos_extra', 'acordos_judiciais'] as const
export const ALL_IMPORT_TYPES = [...OPERATIONAL_IMPORT_TYPES, ...LEGACY_IMPORT_TYPES] as const

export type OperationalImportType = (typeof OPERATIONAL_IMPORT_TYPES)[number]
export type LegacyImportType = (typeof LEGACY_IMPORT_TYPES)[number]
export type ImportType = (typeof ALL_IMPORT_TYPES)[number]

export function isOperationalImportType(tipo: string) {
  return OPERATIONAL_IMPORT_TYPES.includes(tipo as OperationalImportType)
}

export function isLegacyImportType(tipo: string) {
  return LEGACY_IMPORT_TYPES.includes(tipo as LegacyImportType)
}

export function isValidImportType(tipo: string) {
  return ALL_IMPORT_TYPES.includes(tipo as ImportType)
}
