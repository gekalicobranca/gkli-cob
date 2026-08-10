export type AgenteStatusExecucao =
  | 'pendente'
  | 'em_execucao'
  | 'sucesso'
  | 'falha'
  | 'precisa_intervencao'
  | 'cancelada'

export type AgenteStatusValidacao =
  | 'aguardando_validacao'
  | 'validado'
  | 'rejeitado'
  | 'importado'

export type AgenteAdministradora = {
  id: string
  carteira_id: string
  nome: string
  url_portal: string
  tipo_portal: string | null
  exige_captcha: boolean
  exige_2fa: boolean
  ativo: boolean
  observacoes: string | null
  created_at: string
}

export type AgenteReceita = {
  id: string
  administradora_id: string
  carteira_id: string
  nome: string
  descricao: string | null
  tipo_coleta: string
  tipo_arquivo_esperado: string
  periodicidade: string
  script_key: string | null
  ativo: boolean
  created_at: string
  administradora?: {
    nome: string
  } | null
}

export type AgenteExecucao = {
  id: string
  receita_id: string
  administradora_id: string
  carteira_id: string
  condominio_id: string | null
  status: AgenteStatusExecucao
  solicitado_por: string | null
  iniciado_em: string | null
  finalizado_em: string | null
  erro_mensagem: string | null
  tentativas: number
  created_at: string
  receita?: {
    nome: string
  } | null
  administradora?: {
    nome: string
  } | null
  arquivos?: Array<{
    id: string
    nome_arquivo: string
    tipo_arquivo: string | null
    tamanho_bytes: number | null
    status_validacao: AgenteStatusValidacao
    created_at: string
  }>
}
