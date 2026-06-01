export const MENSAGEM_STATUS = {
  RASCUNHO: 'rascunho',
  PENDENTE_APROVACAO: 'pendente_aprovacao',
  APROVADA: 'aprovada',
  AGENDADA: 'agendada',
  ENVIADA: 'enviada',
  FALHA: 'falha',
  CANCELADA: 'cancelada',
} as const

export type MensagemStatus = (typeof MENSAGEM_STATUS)[keyof typeof MENSAGEM_STATUS]

export const MENSAGEM_STATUS_LIST = Object.values(MENSAGEM_STATUS)

export const MENSAGEM_STATUS_OPERACIONAL = {
  ...MENSAGEM_STATUS,
  AGUARDANDO_RETORNO: 'aguardando_retorno',
} as const

export type MensagemStatusOperacional =
  (typeof MENSAGEM_STATUS_OPERACIONAL)[keyof typeof MENSAGEM_STATUS_OPERACIONAL]

export const MENSAGEM_STATUS_OPERACIONAL_LIST = Object.values(MENSAGEM_STATUS_OPERACIONAL)

export const MENSAGEM_STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  pendente_aprovacao: 'Pendente de aprovação',
  aprovada: 'Aprovada',
  agendada: 'Agendada',
  enviada: 'Enviada',
  falha: 'Falha',
  cancelada: 'Cancelada',
  aguardando_retorno: 'Aguardando retorno',
}

export const TEMPLATE_TIPO = {
  COBRANCA: 'cobranca',
  ACORDO: 'acordo',
} as const

export const MENSAGEM_CANAL = {
  WHATSAPP: 'whatsapp',
  EMAIL: 'email',
} as const
