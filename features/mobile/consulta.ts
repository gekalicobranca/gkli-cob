export const MOBILE_VIEWS = ['cobrancas', 'extrajudiciais', 'judiciais', 'resultados'] as const
export type MobileView = typeof MOBILE_VIEWS[number]
export type MobileSelection = { modo: 'carteira' | 'condominio'; carteiraId: string; condominioId: string; inicio: string; fim: string }
export function periodoMobileValido(inicio: string, fim: string) {
  const valid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
  return valid(inicio) && valid(fim) && inicio <= fim && Date.parse(fim) - Date.parse(inicio) < 366 * 86400000
}
export function mobileQuery(selection: MobileSelection, view: MobileView, page = 1) {
  return new URLSearchParams({ view, inicio: selection.inicio, fim: selection.fim,
    carteira_id: selection.modo === 'carteira' ? selection.carteiraId : '',
    condominio_id: selection.modo === 'condominio' ? selection.condominioId : '', page: String(page) })
}
