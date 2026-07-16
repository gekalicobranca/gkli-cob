export const COBRANCA_STATUS_OPERACIONAL = {
  NOVO: 'novo',
  EM_COBRANCA_ATIVA: 'em_cobranca_ativa',
  EM_NEGOCIACAO: 'em_negociacao',
  POSSIVEL_ACORDO: 'possivel_acordo',
  ACORDO_FIRMADO: 'acordo_firmado',
  ACORDO_EFETIVADO: 'acordo_efetivado',
  PRE_JURIDICO: 'pre_juridico',
  JUDICIALIZADO: 'judicializado',
  SUSPENSO: 'suspenso',
} as const

export type CobrancaStatusOperacional =
  (typeof COBRANCA_STATUS_OPERACIONAL)[keyof typeof COBRANCA_STATUS_OPERACIONAL]

export const COBRANCA_STATUS_OPERACIONAL_LIST = Object.values(COBRANCA_STATUS_OPERACIONAL)

export const COBRANCA_STATUS_FINANCEIRO = {
  EM_ABERTO: 'em_aberto',
  PARCIAL: 'parcial',
  QUITADO: 'quitado',
  VENCIDO: 'vencido',
  RENEGOCIADO: 'renegociado',
} as const

export type CobrancaStatusFinanceiro =
  (typeof COBRANCA_STATUS_FINANCEIRO)[keyof typeof COBRANCA_STATUS_FINANCEIRO]

export const COBRANCA_STATUS_FINANCEIRO_LIST = Object.values(COBRANCA_STATUS_FINANCEIRO)

export const COBRANCA_STATUS_OPERACIONAIS_ATIVOS: CobrancaStatusOperacional[] = [
  COBRANCA_STATUS_OPERACIONAL.NOVO,
  COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA,
  COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO,
  COBRANCA_STATUS_OPERACIONAL.POSSIVEL_ACORDO,
]

export const COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO: CobrancaStatusOperacional[] = [
  COBRANCA_STATUS_OPERACIONAL.ACORDO_FIRMADO,
  COBRANCA_STATUS_OPERACIONAL.ACORDO_EFETIVADO,
  COBRANCA_STATUS_OPERACIONAL.PRE_JURIDICO,
  COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO,
  COBRANCA_STATUS_OPERACIONAL.SUSPENSO,
]

export const COBRANCA_STATUS_JUDICIALIZACAO: CobrancaStatusOperacional[] = [
  COBRANCA_STATUS_OPERACIONAL.PRE_JURIDICO,
  COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO,
]

export const COBRANCA_STATUS_SEM_ACAO: CobrancaStatusOperacional[] = [
  COBRANCA_STATUS_OPERACIONAL.PRE_JURIDICO,
  COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO,
  COBRANCA_STATUS_OPERACIONAL.SUSPENSO,
  COBRANCA_STATUS_OPERACIONAL.ACORDO_EFETIVADO,
]

export const COBRANCA_STATUS_LABEL: Record<CobrancaStatusOperacional | CobrancaStatusFinanceiro, string> = {
  novo: 'Novo',
  em_cobranca_ativa: 'Em cobrança ativa',
  em_negociacao: 'Em negociação',
  possivel_acordo: 'Possível acordo',
  acordo_firmado: 'Acordo firmado',
  acordo_efetivado: 'Acordo efetivado',
  pre_juridico: 'Pré-jurídico',
  judicializado: 'Judicializado',
  suspenso: 'Suspenso',
  em_aberto: 'Em aberto',
  parcial: 'Parcial',
  quitado: 'Quitado',
  vencido: 'Vencido',
  renegociado: 'Renegociado',
}

export function isCobrancaStatusOperacional(value: string): value is CobrancaStatusOperacional {
  return (COBRANCA_STATUS_OPERACIONAL_LIST as string[]).includes(value)
}
