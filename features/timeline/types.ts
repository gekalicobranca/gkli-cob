export type TimelineSeveridade = 'info' | 'sucesso' | 'alerta' | 'critico'

export type TimelineOperacionalItem = {
  id: string
  carteira_id: string | null
  entidade_tipo: string
  entidade_id: string | null
  evento_tipo: string
  titulo: string
  descricao: string | null
  severidade: TimelineSeveridade
  status_anterior: string | null
  status_novo: string | null
  condominio_id: string | null
  unidade_id: string | null
  cobranca_id: string | null
  acordo_id: string | null
  administradora_id: string | null
  solicitacao_administradora_id: string | null
  lote_id: string | null
  mensagem_id: string | null
  usuario_nome: string | null
  usuario_email: string | null
  origem: string
  payload: Record<string, unknown> | null
  ocorreu_em: string
  created_at: string
}

export type TimelineFilters = {
  q?: string | null
  entidadeTipo?: string | null
  eventoTipo?: string | null
  severidade?: string | null
  carteiraId?: string | null
  periodo?: string | null
}

export type TimelineMetricas = {
  total: number
  criticos: number
  alertas: number
  acordos: number
  cobrancas: number
  administradoras: number
}

export type TimelineOperacionalData = {
  eventos: TimelineOperacionalItem[]
  metricas: TimelineMetricas
  filtros: TimelineFilters
}
