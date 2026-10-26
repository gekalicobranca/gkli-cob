/** Datas inclusivas: basta uma parcela do acordo vencer no intervalo. */
export function acordoTemParcelaNoPeriodo(parcelas: Array<{ vencimento?: string | null }> | null | undefined, inicio?: string, fim?: string) {
  if (!inicio && !fim) return true
  return (parcelas ?? []).some(p => {
    const data = p.vencimento?.slice(0, 10)
    return Boolean(data && (!inicio || data >= inicio) && (!fim || data <= fim))
  })
}
