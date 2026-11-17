type Divergencia = {
  tipo: string
  unidade?: string
  referencia?: string
  vencimento?: string
  motivo: string
  valor?: number
  valorSalvo?: number
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

type PreviaPreJuridico = {
  dataBase: string
  habilitado: boolean
  prazoDias: number
  minimoCotas?: number
  quantidadeCotas: number
  saldoCentavos: number
  revisoesJudiciais?: { acordoId: string; unidade: string; processo?: string | null; cotas: { recibo: string; vencimento: string; saldoCentavos: number }[] }[]
  unidades: {
    unidadeId: string
    unidade: string
    totalEmAtraso: number
    exigeRevisaoVinculo: boolean
    recibosParaVincular?: string[]
    saldoCentavos: number
    cotas: {
      recibo: string
      competencia: string | null
      vencimento: string
      diasAtraso: number
      saldoCentavos: number
      vinculoExato: boolean
    }[]
  }[]
}

type PreviaBordero = {
  periodoId?: string
  status?: string
  inicio: string
  fim: string
  totalCentavos: number
  linhas: { parcelaId: string; descricao: string }[]
  pendencias: { parcelaId: string; unidade: string; numero: string | null; parcela: number; motivo: string }[]
}

export type AcordoAuditado = {
  acordoId: string
  unidade: string | null
  bloco: string | null
  numero: string | null
  cotasProtegidas: number
  estado: 'encontrado' | 'historico' | 'critico' | 'inconclusivo'
  motivo?: string
}

export type CondominioEspelhamento = {
  auditoria?: { concluidaEm: string; administradora: string | null; encontrados: number; excecoes: AcordoAuditado[] }
  id: string
  nome: string
  nomeOperacional: string | null
  carteira: string
  administradoras: string[]
  liberado: boolean
  liberacaoEm: string | null
  cotasEmCobrancaAtiva: number
  agendado?: boolean
  liberacao: 'revisao' | 'cotas' | 'completo'
  ultimaConferenciaEm: string | null
  ultimoEspelhamentoEm: string | null
  execucao: {
    id: string
    estado: 'fila' | 'processando' | 'concluido' | 'falha'
    aplicar: boolean
    concluidoEm: string | null
    resumo: {
      cotas?: number
      acordos?: number | null
      parcelasPagas?: number
      pendencias: number
      erro?: string
    } | null
  } | null
}

export type ResultadoEspelhamento = {
  cotas?: number
  acordos?: number | null
  auditoriaAcordos?: AcordoAuditado[]
  parcelasPagas?: number
  aplicadas?: number
  avisos?: string[]
  alteracoes?: Alteracao[]
  pendencias?: Divergencia[]
  preJuridico?: PreviaPreJuridico
  homologacoes?: { acordoId: string; unidade: string; numero: string; composicaoConferida: boolean; condicoesConferidas: boolean; documento: string }[]
  contatosEFlows?: {
    contatosConferidos: number
    revisoes: { unidadeId?: string; unidade: string; bloco: string | null; motivo: string; revisao?: string | null }[]
    candidatas: { id: string; unidadeId: string; unidade: string; bloco: string | null; recibo: string; saldoCentavos: number; canais: string[]; destinatarios?: Record<string, string> }[]
  }
  bordero?: PreviaBordero | null
  borderoAnterior?: PreviaBordero | null
  erro?: string
}
