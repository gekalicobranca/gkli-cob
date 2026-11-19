import { PARCELA_ACORDO_STATUS } from '../../lib/constants/acordos'

/** Datas inclusivas para parcelas com vencimento válido no período. */
export function acordoTemParcelaNoPeriodo(parcelas: Array<{ vencimento?: string | null; status?: string | null }> | null | undefined, inicio?: string, fim?: string) {
  if (!inicio && !fim) return true
  return (parcelas ?? []).some(p => {
    if (p.status === PARCELA_ACORDO_STATUS.CANCELADA) return false
    const data = p.vencimento?.slice(0, 10)
    return Boolean(data && (!inicio || data >= inicio) && (!fim || data <= fim))
  })
}
