export const EMPTY_UUID = '00000000-0000-0000-0000-000000000000' as const

export * from '@/lib/constants'

export {
  COBRANCA_STATUS_OPERACIONAL as COBRANCA_STATUS,
  COBRANCA_STATUS_OPERACIONAL_LIST as COBRANCA_STATUS_LIST,
  isCobrancaStatusOperacional as isCobrancaStatus,
} from '@/lib/constants/cobrancas'

export function normalizeStatus(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
