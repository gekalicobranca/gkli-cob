export const IMPORTACAO_STATUS = {
  PREVIEW: 'preview',
  CONFIRMADA: 'confirmada',
  ERRO: 'erro',
  CANCELADA: 'cancelada',
} as const

export type ImportacaoStatus = (typeof IMPORTACAO_STATUS)[keyof typeof IMPORTACAO_STATUS]

export const IMPORTACAO_TIPO = {
  CONDOMINIOS: 'condominios',
  UNIDADES: 'unidades',
  COBRANCAS: 'cobrancas',
  ACORDOS_EXTRAJUDICIAIS: 'acordos_extrajudiciais',
  ACORDOS_JUDICIAIS: 'acordos_judiciais',
  LEGADO: 'legado',
} as const

export const IMPORTACAO_STATUS_LABEL: Record<string, string> = {
  preview: 'Prévia',
  confirmada: 'Confirmada',
  erro: 'Erro',
  cancelada: 'Cancelada',
}
// Reserva espaço para os campos e o envelope multipart no limite da Vercel.
export const IMPORTACAO_ARQUIVO_MAX_BYTES = 4_000_000
export const IMPORTACAO_ARQUIVO_TAMANHO_ERRO =
  'O arquivo ultrapassa o limite de 4 MB. Divida a planilha em arquivos menores e importe cada parte separadamente.'
