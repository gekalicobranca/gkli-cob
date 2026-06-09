export type Administradora = {
  id: string
  carteira_id?: string | null
  nome: string
  nome_operacional?: string | null
  cnpj?: string | null
  telefone?: string | null
  email?: string | null
  site?: string | null
  status?: string | null
  acesso_gerar_acordo?: boolean | null
  responsavel_interno?: string | null
  observacoes?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type AdministradoraContato = {
  id: string
  administradora_id: string
  nome: string
  cargo?: string | null
  setor?: string | null
  email?: string | null
  telefone?: string | null
  whatsapp?: string | null
  principal?: boolean | null
  recebe_cobranca?: boolean | null
  recebe_boleto?: boolean | null
  recebe_planilha?: boolean | null
  ativo?: boolean | null
  created_at?: string | null
}

export type SolicitacaoAdministradora = {
  id: string
  carteira_id?: string | null
  administradora_id: string
  contato_id?: string | null
  condominio_id?: string | null
  unidade_id?: string | null
  cobranca_id?: string | null
  acordo_id?: string | null
  tipo: string
  status: string
  prioridade?: string | null
  responsavel_interno?: string | null
  canal?: string | null
  assunto?: string | null
  mensagem?: string | null
  prazo_resposta?: string | null
  data_resposta?: string | null
  ultima_interacao_em?: string | null
  observacoes?: string | null
  created_at?: string | null
  administradoras?: { nome?: string | null } | null
  administradora_contatos?: { nome?: string | null; email?: string | null; whatsapp?: string | null } | null
}

export type TemplateMensageriaAdm = {
  id: string
  carteira_id?: string | null
  nome: string
  tipo: string
  assunto?: string | null
  conteudo: string
  ativo?: boolean | null
}

export type AdministradoraMetricas = {
  contatosAtivos: number
  solicitacoesAbertas: number
  solicitacoesAtrasadas: number
  solicitacoesResolvidas: number
  tempoMedioRespostaHoras: number | null
}
