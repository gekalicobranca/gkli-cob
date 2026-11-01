export const MOBILE_VIEWS = ['cobrancas', 'extrajudiciais', 'judiciais', 'resultados'] as const
export type MobileView = typeof MOBILE_VIEWS[number]
export type MobileSelection = { modo: 'carteira' | 'condominio'; carteiraId: string; condominioId: string; periodoId: string; inicio: string; fim: string }
export type MobilePeriod = { id: string; competencia: string; inicio: string; fim: string }
export function nomePeriodoMobile(periodo: MobilePeriod) {
  const competencia = /^\d{4}-\d{2}/.test(periodo.competencia) ? `${periodo.competencia.slice(5, 7)}/${periodo.competencia.slice(0, 4)}` : periodo.competencia
  const date = (v: string) => v.slice(0, 10).split('-').reverse().join('/')
  return `Fechamento ${competencia} · ${date(periodo.inicio)} a ${date(periodo.fim)}`
}
export function periodoMobileValido(inicio: string, fim: string) {
  const valid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
  return valid(inicio) && valid(fim) && inicio <= fim && Date.parse(fim) - Date.parse(inicio) < 366 * 86400000
}
export function mobileQuery(selection: MobileSelection, view: MobileView, page = 1) {
  return new URLSearchParams({ view, periodo_id: selection.periodoId,
    carteira_id: selection.modo === 'carteira' ? selection.carteiraId : '',
    condominio_id: selection.modo === 'condominio' ? selection.condominioId : '', page: String(page) })
}
