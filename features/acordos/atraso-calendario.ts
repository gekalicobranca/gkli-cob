export function dataOperacionalAcordos(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora)
}

export function diasAtrasoAcordo(vencimento: string, hoje: string) {
  return Math.floor((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${vencimento}T00:00:00Z`)) / 86_400_000)
}

type Parcela = { vencimento: string; numero?: number; status: string; data_pagamento?: string | null; valor?: number | string }

export function classificarSituacaoNoPeriodo(parcelas: Parcela[], inicio: string, fim: string) {
  const periodo = parcelas.filter(p => !['cancelada', 'cancelado'].includes(p.status)
    && p.vencimento.slice(0, 10) >= inicio && p.vencimento.slice(0, 10) <= fim)
  if (!periodo.length) return null
  const paga = (p: Parcela) => ['paga', 'pago', 'quitada', 'quitado', 'efetivado', 'efetivada'].includes(p.status) || Boolean(p.data_pagamento)
  return periodo.every(paga) ? 'em_dia' : 'ativo'
}

export function classificarPrazoAcordo(parcelas: Parcela[], hoje: string, diasParaAtraso = 15, diasParaRomper = 30, valorAcordado?: number | string) {
  const ordenadas = parcelas.filter(p => p.status !== 'cancelada')
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || (a.numero ?? 0) - (b.numero ?? 0))
  const paga = (p: Parcela) => p.status === 'paga' || Boolean(p.data_pagamento)
  const abertas = ordenadas.filter(p => !paga(p))
  if (!abertas.length) {
    const centavos = (v: unknown) => Math.round(Number(v) * 100)
    const valoresValidos = parcelas.every(p => p.valor != null && Number.isFinite(Number(p.valor)) && Number(p.valor) >= 0)
    const pago = parcelas.reduce((soma, p) => soma + centavos(p.valor), 0)
    // Parcelas canceladas ou cronograma incompleto não comprovam quitação.
    if (parcelas.length > 0 && parcelas.every(paga) && valoresValidos
      && valorAcordado != null && Number.isFinite(Number(valorAcordado)) && Number(valorAcordado) > 0
      && pago >= centavos(valorAcordado)) return 'quitado'
    return ordenadas.some(p => paga(p) && p.vencimento.slice(0, 7) === hoje.slice(0, 7)) ? 'em_dia' : null
  }
  const atraso = diasAtrasoAcordo(abertas[0].vencimento, hoje)
  if (atraso >= diasParaRomper) return 'quebrado'
  if (atraso >= diasParaAtraso) return 'em_atraso'
  if (atraso > 0) return 'ativo' // Tolerância D+1 a D+14 não significa “em dia”.
  const indice = ordenadas.indexOf(abertas[0])
  return indice > 0 && paga(ordenadas[indice - 1]) ? 'em_dia' : 'ativo'
}
