export type EntidadeOperacional =
  | 'operacional'
  | 'condominio'
  | 'unidade'
  | 'cobranca'
  | 'acordo'
  | 'parcela_acordo'
  | 'lote'
  | 'lote_mensagem'
  | 'mensagem'
  | 'template'
  | 'regua'
  | 'importacao'
  | 'administradora'
  | 'solicitacao_administradora'

export type SeveridadeEvento = 'info' | 'sucesso' | 'alerta' | 'critico'

export type OrigemEventoOperacional =
  | 'app'
  | 'manual'
  | 'cron'
  | 'api'
  | 'importacao'
  | 'webhook'
  | 'sistema'

export type RegistrarEventoInput = {
  carteiraId?: string | null
  entidadeTipo: EntidadeOperacional
  entidadeId: string
  eventoCodigo: string
  estadoAnterior?: string | null
  estadoNovo?: string | null
  titulo: string
  descricao?: string | null
  severidade?: SeveridadeEvento
  payload?: Record<string, unknown>
  antes?: Record<string, unknown> | null
  depois?: Record<string, unknown> | null
  origem?: OrigemEventoOperacional
  auditavel?: boolean
  userId?: string | null
  required?: boolean
}

export type TransicionarEstadoInput = {
  carteiraId?: string | null
  entidadeTipo: EntidadeOperacional
  entidadeId: string
  estadoDestino: string
  eventoCodigo: string
  titulo?: string
  descricao?: string | null
  motivo?: string | null
  payload?: Record<string, unknown>
  userId?: string | null
  scorePrioridade?: number
  proximaAcao?: string | null
  motivoPrioridade?: string | null
}

export type EstadoOperacionalAtual = {
  entidade_tipo: EntidadeOperacional
  entidade_id: string
  carteira_id: string | null
  estado_codigo: string
  estado_nome?: string | null
  score_prioridade: number
  proxima_acao: string | null
  motivo_prioridade: string | null
  atualizado_em: string
}
