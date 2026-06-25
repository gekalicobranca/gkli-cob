export type PendenciaPrioridade = 'baixa' | 'normal' | 'alta' | 'critica'
export type PendenciaStatus = 'aberta' | 'em_tratamento' | 'resolvida' | 'cancelada'
export type PendenciaOrigem =
  | 'administradora'
  | 'acordo'
  | 'cobranca'
  | 'mensageria'
  | 'regua'
  | 'manual'

export type PendenciaOperacional = {
  id: string
  carteira_id: string | null
  origem: PendenciaOrigem
  tipo: string
  status: PendenciaStatus
  prioridade: PendenciaPrioridade
  titulo: string
  descricao: string | null
  entidade_tipo: string | null
  entidade_id: string | null
  condominio_id: string | null
  unidade_id: string | null
  cobranca_id: string | null
  acordo_id: string | null
  administradora_id: string | null
  solicitacao_adm_id: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  prazo_limite: string | null
  payload?: Record<string, unknown> | null
  resolvido_em: string | null
  created_at: string
  updated_at: string
}

export type PendenciasResumo = {
  totalAbertas: number
  criticas: number
  atrasadas: number
  emTratamento: number
  administrativas: number
  acordos: number
  mensageria: number
}

export type ListPendenciasParams = {
  q?: string
  status?: string
  prioridade?: string
  origem?: string
  tipo?: string
  situacao?: string
  data_de?: string
  data_ate?: string
  ordenar?: string
}
