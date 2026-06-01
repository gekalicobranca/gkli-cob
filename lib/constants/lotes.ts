export const LOTE_TIPO = {
  REGUA_COBRANCA: 'regua_cobranca',
  REGUA_ACORDO: 'regua_acordo',
  MENSAGERIA: 'mensageria',
  IMPORTACAO: 'importacao',
} as const

export type LoteTipo = (typeof LOTE_TIPO)[keyof typeof LOTE_TIPO]

export const LOTE_STATUS = {
  GERADO: 'gerado',
  PROCESSANDO: 'processando',
  PENDENTE_APROVACAO: 'pendente_aprovacao',
  APROVADO: 'aprovado',
  ENVIADO: 'enviado',
  PARCIAL: 'parcial',
  CONCLUIDO: 'concluido',
  CONCLUIDO_COM_FALHAS: 'concluido_com_falhas',
  CANCELADO: 'cancelado',
  ERRO: 'erro',
} as const

export type LoteStatus = (typeof LOTE_STATUS)[keyof typeof LOTE_STATUS]

export const LOTE_ITEM_STATUS = {
  CRIADO: 'criado',
  PULADA: 'pulada',
  DUPLICADA: 'duplicada',
  ERRO: 'erro',
  APROVADO: 'aprovado',
  ENVIADO: 'enviado',
  PAUSADO: 'pausado',
  RETORNO_REGISTRADO: 'retorno_registrado',
  CANCELADO: 'cancelado',
} as const

export type LoteItemStatus = (typeof LOTE_ITEM_STATUS)[keyof typeof LOTE_ITEM_STATUS]

export const LOTE_STATUS_LABEL: Record<string, string> = {
  regua_cobranca: 'Régua de cobrança',
  regua_acordo: 'Régua de acordo',
  mensageria: 'Mensageria',
  importacao: 'Importação',
  gerado: 'Gerado',
  processando: 'Processando',
  pendente_aprovacao: 'Pendente de aprovação',
  aprovado: 'Aprovado',
  enviado: 'Enviado',
  parcial: 'Parcial',
  concluido: 'Concluído',
  concluido_com_falhas: 'Concluído com falhas',
  cancelado: 'Cancelado',
  erro: 'Erro',
  criado: 'Criado',
  pulada: 'Pulada',
  duplicada: 'Duplicada',
  pausado: 'Pausado',
  retorno_registrado: 'Retorno registrado',
}
