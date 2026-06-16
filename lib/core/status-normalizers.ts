import {
  ACORDO_STATUS,
  ACORDO_STATUS_FINANCEIRO,
  LOTE_ITEM_STATUS,
  LOTE_STATUS,
  MENSAGEM_STATUS,
  COBRANCA_STATUS_FINANCEIRO,
  COBRANCA_STATUS_OPERACIONAL,
  PARCELA_ACORDO_STATUS,
  normalizeStatus,
} from '@/lib/core/status'

export function normalizeCobrancaStatusOperacional(value: unknown) {
  const status = normalizeStatus(value)
  const aliases: Record<string, string> = {
    aberto: COBRANCA_STATUS_OPERACIONAL.NOVO,
    aberta: COBRANCA_STATUS_OPERACIONAL.NOVO,
    novo: COBRANCA_STATUS_OPERACIONAL.NOVO,
    nova: COBRANCA_STATUS_OPERACIONAL.NOVO,
    cobranca: COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA,
    em_cobranca: COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA,
    em_cobranca_ativa: COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA,
    negociacao: COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO,
    em_negociacao: COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO,
    acordo: COBRANCA_STATUS_OPERACIONAL.ACORDO_FIRMADO,
    acordo_firmado: COBRANCA_STATUS_OPERACIONAL.ACORDO_FIRMADO,
    acordo_efetivado: COBRANCA_STATUS_OPERACIONAL.ACORDO_EFETIVADO,
    pre_juridico: COBRANCA_STATUS_OPERACIONAL.PRE_JURIDICO,
    pre_judicial: COBRANCA_STATUS_OPERACIONAL.PRE_JURIDICO,
    juridico: COBRANCA_STATUS_OPERACIONAL.PRE_JURIDICO,
    judicial: COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO,
    judicializado: COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO,
    suspensa: COBRANCA_STATUS_OPERACIONAL.SUSPENSO,
    suspenso: COBRANCA_STATUS_OPERACIONAL.SUSPENSO,
  }

  return aliases[status] ?? COBRANCA_STATUS_OPERACIONAL.NOVO
}

export function normalizeCobrancaStatusFinanceiro(value: unknown) {
  const status = normalizeStatus(value)
  const aliases: Record<string, string> = {
    aberto: COBRANCA_STATUS_FINANCEIRO.EM_ABERTO,
    em_aberto: COBRANCA_STATUS_FINANCEIRO.EM_ABERTO,
    pendente: COBRANCA_STATUS_FINANCEIRO.EM_ABERTO,
    parcial: COBRANCA_STATUS_FINANCEIRO.PARCIAL,
    pago_parcial: COBRANCA_STATUS_FINANCEIRO.PARCIAL,
    quitado: COBRANCA_STATUS_FINANCEIRO.QUITADO,
    pago: COBRANCA_STATUS_FINANCEIRO.QUITADO,
    vencido: COBRANCA_STATUS_FINANCEIRO.VENCIDO,
    vencida: COBRANCA_STATUS_FINANCEIRO.VENCIDO,
    renegociado: COBRANCA_STATUS_FINANCEIRO.RENEGOCIADO,
  }

  return aliases[status] ?? COBRANCA_STATUS_FINANCEIRO.EM_ABERTO
}

export function normalizeAcordoStatus(value: unknown) {
  const status = normalizeStatus(value)
  const aliases: Record<string, string> = {
    ativo: ACORDO_STATUS.ATIVO,
    em_dia: ACORDO_STATUS.EM_DIA,
    adimplente: ACORDO_STATUS.EM_DIA,
    em_atraso: ACORDO_STATUS.EM_ATRASO,
    atrasado: ACORDO_STATUS.EM_ATRASO,
    vencido: ACORDO_STATUS.VENCIDO,
    vencida: ACORDO_STATUS.VENCIDO,
    quebrado: ACORDO_STATUS.QUEBRADO,
    quebra: ACORDO_STATUS.QUEBRADO,
    rompido: ACORDO_STATUS.QUEBRADO,
    rompida: ACORDO_STATUS.QUEBRADO,
    quitado: ACORDO_STATUS.QUITADO,
    pago: ACORDO_STATUS.QUITADO,
    cancelado: ACORDO_STATUS.CANCELADO,
    cancelada: ACORDO_STATUS.CANCELADO,
    renegociado: ACORDO_STATUS.RENEGOCIADO,
  }

  return aliases[status] ?? ACORDO_STATUS.ATIVO
}

export function normalizeAcordoStatusFinanceiro(value: unknown) {
  const status = normalizeStatus(value)
  const aliases: Record<string, string> = {
    aberto: ACORDO_STATUS_FINANCEIRO.EM_ABERTO,
    em_aberto: ACORDO_STATUS_FINANCEIRO.EM_ABERTO,
    pendente: ACORDO_STATUS_FINANCEIRO.EM_ABERTO,
    parcial: ACORDO_STATUS_FINANCEIRO.PARCIAL,
    quitado: ACORDO_STATUS_FINANCEIRO.QUITADO,
    pago: ACORDO_STATUS_FINANCEIRO.QUITADO,
    vencido: ACORDO_STATUS_FINANCEIRO.VENCIDO,
    vencida: ACORDO_STATUS_FINANCEIRO.VENCIDO,
  }

  return aliases[status] ?? ACORDO_STATUS_FINANCEIRO.EM_ABERTO
}

export function normalizeParcelaAcordoStatus(value: unknown) {
  const status = normalizeStatus(value)
  const aliases: Record<string, string> = {
    pendente: PARCELA_ACORDO_STATUS.PENDENTE,
    aberto: PARCELA_ACORDO_STATUS.PENDENTE,
    em_aberto: PARCELA_ACORDO_STATUS.PENDENTE,
    paga: PARCELA_ACORDO_STATUS.PAGA,
    pago: PARCELA_ACORDO_STATUS.PAGA,
    quitada: PARCELA_ACORDO_STATUS.PAGA,
    vencida: PARCELA_ACORDO_STATUS.VENCIDA,
    vencido: PARCELA_ACORDO_STATUS.VENCIDA,
    cancelada: PARCELA_ACORDO_STATUS.CANCELADA,
    cancelado: PARCELA_ACORDO_STATUS.CANCELADA,
  }

  return aliases[status] ?? PARCELA_ACORDO_STATUS.PENDENTE
}

export function normalizeMensagemStatus(value: unknown) {
  const status = normalizeStatus(value)
  const aliases: Record<string, string> = {
    rascunho: MENSAGEM_STATUS.RASCUNHO,
    criada: MENSAGEM_STATUS.RASCUNHO,
    criado: MENSAGEM_STATUS.RASCUNHO,
    pendente: MENSAGEM_STATUS.PENDENTE_APROVACAO,
    pendente_aprovacao: MENSAGEM_STATUS.PENDENTE_APROVACAO,
    aprovada: MENSAGEM_STATUS.APROVADA,
    aprovado: MENSAGEM_STATUS.APROVADA,
    agendada: MENSAGEM_STATUS.AGENDADA,
    agendado: MENSAGEM_STATUS.AGENDADA,
    enviada: MENSAGEM_STATUS.ENVIADA,
    enviado: MENSAGEM_STATUS.ENVIADA,
    erro: MENSAGEM_STATUS.FALHA,
    falha: MENSAGEM_STATUS.FALHA,
    cancelada: MENSAGEM_STATUS.CANCELADA,
    cancelado: MENSAGEM_STATUS.CANCELADA,
  }

  return aliases[status] ?? MENSAGEM_STATUS.RASCUNHO
}

export function normalizeLoteStatus(value: unknown) {
  const status = normalizeStatus(value)
  const aliases: Record<string, string> = {
    gerado: LOTE_STATUS.GERADO,
    processando: LOTE_STATUS.PROCESSANDO,
    pendente: LOTE_STATUS.PENDENTE_APROVACAO,
    pendente_aprovacao: LOTE_STATUS.PENDENTE_APROVACAO,
    aprovado: LOTE_STATUS.APROVADO,
    enviada: LOTE_STATUS.ENVIADO,
    enviado: LOTE_STATUS.ENVIADO,
    parcial: LOTE_STATUS.PARCIAL,
    concluido: LOTE_STATUS.CONCLUIDO,
    concluido_com_falhas: LOTE_STATUS.CONCLUIDO_COM_FALHAS,
    cancelado: LOTE_STATUS.CANCELADO,
    erro: LOTE_STATUS.ERRO,
  }

  return aliases[status] ?? LOTE_STATUS.GERADO
}

export function normalizeLoteItemStatus(value: unknown) {
  const status = normalizeStatus(value)
  const aliases: Record<string, string> = {
    criado: LOTE_ITEM_STATUS.CRIADO,
    criada: LOTE_ITEM_STATUS.CRIADO,
    pulada: LOTE_ITEM_STATUS.PULADA,
    pulado: LOTE_ITEM_STATUS.PULADA,
    duplicada: LOTE_ITEM_STATUS.DUPLICADA,
    duplicado: LOTE_ITEM_STATUS.DUPLICADA,
    erro: LOTE_ITEM_STATUS.ERRO,
    aprovado: LOTE_ITEM_STATUS.APROVADO,
    aprovada: LOTE_ITEM_STATUS.APROVADO,
    enviado: LOTE_ITEM_STATUS.ENVIADO,
    enviada: LOTE_ITEM_STATUS.ENVIADO,
    cancelado: LOTE_ITEM_STATUS.CANCELADO,
    cancelada: LOTE_ITEM_STATUS.CANCELADO,
  }

  return aliases[status] ?? LOTE_ITEM_STATUS.CRIADO
}
