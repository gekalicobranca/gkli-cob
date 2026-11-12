export function dataOperacionalAcordos(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora)
}

export function diasAtrasoAcordo(vencimento: string, hoje: string) {
  return Math.floor((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${vencimento}T00:00:00Z`)) / 86_400_000)
}

type Parcela = { vencimento: string; numero?: number; status: string; data_pagamento?: string | null; valor?: number | string }

export function classificarPrazoAcordo(parcelas: Parcela[], hoje: string, valorAcordado?: number | string) {
  const validas = parcelas.filter(p => p.status !== 'cancelada')
  const paga = (p: Parcela) => p.status === 'paga' || Boolean(p.data_pagamento)
  const abertas = validas.filter(p => !paga(p))
  if (!abertas.length) {
    const centavos = (v: unknown) => Math.round(Number(v) * 100)
    const valoresValidos = parcelas.every(p => p.valor != null && Number.isFinite(Number(p.valor)) && Number(p.valor) >= 0)
    const pago = parcelas.reduce((soma, p) => soma + centavos(p.valor), 0)
    // Parcelas canceladas ou cronograma incompleto não comprovam quitação.
    if (parcelas.length > 0 && parcelas.every(paga) && valoresValidos
      && valorAcordado != null && Number.isFinite(Number(valorAcordado)) && Number(valorAcordado) > 0
      && pago >= centavos(valorAcordado)) return 'quitado'
    return validas.some(p => paga(p) && p.vencimento.slice(0, 7) === hoje.slice(0, 7)) ? 'em_dia' : null
  }
  if (abertas.some(p => p.vencimento && diasAtrasoAcordo(p.vencimento.slice(0, 10), hoje) > 0)) return 'em_atraso'
  return validas.some(paga) ? 'em_dia' : 'ativo'
}
