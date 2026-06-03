export type RelatorioTipo =
  | 'carteiras-condominios'
  | 'condominios-administradoras'
  | 'condominios-cobrancas'
  | 'condominios-acordos'

export type RelatorioModo = 'sintetico' | 'detalhado'

export type RelatorioFilters = {
  carteiraId?: string
  q?: string
  status?: string
  orderBy?: string
  orderDir?: 'asc' | 'desc'
}

export type RelatorioResumo = {
  grupos: number
  condominios: number
  registros: number
  valor: number
}

export type RelatorioLinha = {
  id: string
  titulo: string
  subtitulo?: string
  carteira?: string
  administradora?: string
  condominios: number
  registros: number
  valorOriginal: number
  valorAtualizado: number
  valorAcordado: number
  ativos: number
  inativos: number
  suspensos: number
  statusAberto: number
  statusNegociacao: number
  statusAcordo: number
  statusSuspenso: number
  detalhe: RelatorioDetalheItem[]
}

export type RelatorioDetalheItem = {
  id: string
  titulo: string
  subtitulo?: string
  carteira?: string
  administradora?: string
  status?: string
  vencimento?: string | null
  valor?: number
  valorAtualizado?: number
  tipo?: string
}
