type ParcelaExecutivo = {
  id?: string
  numero?: number | string
  vencimento?: string | null
  status?: string | null
  data_pagamento?: string | null
  valor_repasse_informado?: number | string | null
}

export function parcelasDoPeriodoExecutivo<T extends ParcelaExecutivo>(parcelas: T[], de = '', ate = '') {
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(de) ? de : ''
  const fim = /^\d{4}-\d{2}-\d{2}$/.test(ate) ? ate : ''
  return parcelas.filter(parcela => {
    const vencimento = parcela.vencimento?.slice(0, 10)
    return (!inicio || Boolean(vencimento && vencimento >= inicio)) &&
      (!fim || Boolean(vencimento && vencimento <= fim))
  }).sort((a, b) => String(a.vencimento ?? '').localeCompare(String(b.vencimento ?? '')) || Number(a.numero ?? 0) - Number(b.numero ?? 0))
}

export function pagamentoParcelaExecutivo(parcela: ParcelaExecutivo) {
  if (['cancelada', 'cancelado'].includes(String(parcela.status).toLowerCase())) return 'Cancelada'
  if (parcela.data_pagamento || ['paga', 'pago', 'quitado', 'quitada', 'efetivado', 'efetivada'].includes(String(parcela.status).toLowerCase())) return 'Paga'
  return 'Sem baixa'
}

export function repasseParcelaExecutivo(parcela: ParcelaExecutivo) {
  const valor = parcela.valor_repasse_informado
  if (valor == null || String(valor).trim() === '') return null
  const numero = Number(valor)
  return Number.isFinite(numero) && numero >= 0 ? numero : null
}
