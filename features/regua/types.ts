export type ReguaTipo = 'cobranca' | 'acordo'
export type ReguaTom = 'leve' | 'medio' | 'agressivo'
export type ReguaCanal = 'whatsapp' | 'email'
export type ExecucaoStatus = 'pendente' | 'enviado' | 'erro' | 'pulado'

export type ReguaEtapa = {
  id: string
  regua_id: string
  ordem: number
  delay_dias: number
  canal: ReguaCanal
  template: string
  template_id?: string | null
  categoria_template?: string | null
  tom: ReguaTom
  ativo?: boolean
}

export type Regua = {
  id: string
  nome: string
  tipo: ReguaTipo
  ativo: boolean
  etapas?: ReguaEtapa[]
}

export type ContextoMensagem = Record<string, string | number | null | undefined>
