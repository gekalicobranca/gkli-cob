export type ReguaTipo = 'cobranca' | 'acordo' | 'juridico'
export type ReguaStatus = 'ativa' | 'rascunho' | 'inativa'
export type ReguaCanal = 'whatsapp' | 'email' | 'manual'
export type ReguaIntensidade = 'leve' | 'medio' | 'agressivo'
export type ReguaDelayReferencia = 'vencimento' | 'atraso' | 'parcela' | 'acordo'
export type ReguaDestinatarioPreferencial = 'proprietario' | 'inquilino' | 'qualquer'

export type ReguaResumo = {
  id: string
  carteira_id: string | null
  nome: string
  tipo: ReguaTipo
  status: ReguaStatus
  descricao: string | null
  prioridade: number | null
  padrao: boolean | null
  destinatario_preferencial: ReguaDestinatarioPreferencial | null
  ativo: boolean | null
  created_at: string | null
  updated_at: string | null
  carteiras?: { nome?: string | null } | null
  etapas?: ReguaEtapaResumo[]
}

export type ReguaEtapaResumo = {
  id: string
  regua_id: string
  ordem: number
  nome: string | null
  delay_dias: number
  delay_referencia: ReguaDelayReferencia | string | null
  canal: ReguaCanal | string | null
  template: string | null
  template_id: string | null
  categoria_template?: string | null
  tom: ReguaIntensidade | string | null
  horario_inicio: string | null
  horario_fim: string | null
  acao: string | null
  ativo: boolean | null
  whatsapp_template_nome?: string | null
  whatsapp_template_idioma?: string | null
  whatsapp_template_parametros?: string[] | null
}
