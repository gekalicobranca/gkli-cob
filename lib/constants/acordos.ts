export const ACORDO_STATUS = {
  ATIVO: 'ativo',
  EM_DIA: 'em_dia',
  EM_ATRASO: 'em_atraso',
  VENCIDO: 'vencido',
  QUEBRADO: 'quebrado',
  QUITADO: 'quitado',
  CANCELADO: 'cancelado',
  RENEGOCIADO: 'renegociado',
} as const

export type AcordoStatus = (typeof ACORDO_STATUS)[keyof typeof ACORDO_STATUS]

export const ACORDO_STATUS_LIST = Object.values(ACORDO_STATUS)

export const ACORDO_STATUS_ATIVOS: AcordoStatus[] = [
  ACORDO_STATUS.ATIVO,
  ACORDO_STATUS.EM_DIA,
  ACORDO_STATUS.EM_ATRASO,
  ACORDO_STATUS.VENCIDO,
  ACORDO_STATUS.QUEBRADO,
]

export const ACORDO_STATUS_VIGENTES: AcordoStatus[] = [
  ACORDO_STATUS.ATIVO,
  ACORDO_STATUS.EM_DIA,
  ACORDO_STATUS.EM_ATRASO,
]

export const ACORDO_STATUS_FINANCEIRO = {
  EM_ABERTO: 'em_aberto',
  PARCIAL: 'parcial',
  QUITADO: 'quitado',
  VENCIDO: 'vencido',
} as const

export const ACORDO_RISCO = {
  BAIXO: 'baixo',
  MEDIO: 'medio',
  ALTO: 'alto',
} as const

export const PARCELA_ACORDO_STATUS = {
  PENDENTE: 'pendente',
  PAGA: 'paga',
  VENCIDA: 'vencida',
  CANCELADA: 'cancelada',
} as const

export type ParcelaAcordoStatus =
  (typeof PARCELA_ACORDO_STATUS)[keyof typeof PARCELA_ACORDO_STATUS]

export const PARCELA_ACORDO_STATUS_EM_ABERTO: ParcelaAcordoStatus[] = [
  PARCELA_ACORDO_STATUS.PENDENTE,
  PARCELA_ACORDO_STATUS.VENCIDA,
]

export const ACORDO_STATUS_LABEL: Record<string, string> = {
  ativo: 'Ativo',
  em_dia: 'Em dia',
  em_atraso: 'Em atraso',
  vencido: 'Vencido',
  quebrado: 'Quebrado',
  quitado: 'Quitado',
  cancelado: 'Cancelado',
  renegociado: 'Renegociado',
  em_aberto: 'Em aberto',
  parcial: 'Parcial',
  baixo: 'Baixo',
  medio: 'Médio',
  alto: 'Alto',
  pendente: 'Pendente',
  paga: 'Paga',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
}
