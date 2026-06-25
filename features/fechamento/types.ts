export type FechamentoStatus =
  | 'rascunho'
  | 'aberto'
  | 'em_conferencia'
  | 'fechado'
  | 'faturado'
  | 'reaberto'
  | 'cancelado'

export type FechamentoPeriodo = {
  id: string
  competencia: string
  data_abertura: string
  data_fechamento: string
  data_limite_conferencia?: string | null
  data_fechamento_efetivo?: string | null
  status: FechamentoStatus
  observacoes?: string | null
  total_pagamentos_confirmados?: number | null
  total_base_cobranca?: number | null
  total_despesas_cobranca?: number | null
  total_comissoes?: number | null
  total_faturamento_omie?: number | null
  created_at?: string
  updated_at?: string
}

export type FechamentoResumo = {
  acordos: number
  pagamentos: number
  valorPago: number
  valorRecuperado: number
  valorBaseCobranca: number
  despesas: number
  comissoes: number
  faturamento: number
  divergencias: number
}
