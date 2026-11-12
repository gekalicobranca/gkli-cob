type Divergencia = {
  tipo: string
  unidade?: string
  referencia?: string
  vencimento?: string
  motivo: string
  valor?: number
  app?: string
}

type Alteracao = {
  tipo: string
  unidade: string
  recibo?: string
  numero?: string
  vencimento?: string
  total?: number
  valorPago?: number
  dataPagamento?: string
}

export type CondominioEspelhamento = {
  id: string
  nome: string
  nomeOperacional: string | null
  carteira: string
  ultimaConferenciaEm: string | null
  ultimoEspelhamentoEm: string | null
  execucao: {
    id: string
    estado: 'fila' | 'processando' | 'concluido' | 'falha'
    aplicar: boolean
    concluidoEm: string | null
    resultado: {
      cotas?: number
      acordos?: number
      parcelasPagas?: number
      aplicadas?: number
      alteracoes?: Alteracao[]
      pendencias?: Divergencia[]
      erro?: string
    } | null
  } | null
}
