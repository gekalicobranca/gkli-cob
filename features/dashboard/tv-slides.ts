import { buildTvMetrics, type TvCharge, type TvAgreement, type TvInstallment } from './tv-metrics'

export function tvWalletTheme(name: string) {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (normalized.includes('escritorio') && normalized.includes('genske')) return { color: '#b3679b', foreground: '#f1c8e4' }
  if (normalized.includes('genske')) return { color: '#351b40', foreground: '#e3c9ed' }
  if (normalized.includes('gekali')) return { color: '#03658C', foreground: '#8bdaef' }
  if (normalized.includes('azevedo')) return { color: '#FCA17D', foreground: '#FCA17D' }
  return { color: '#03658C', foreground: '#8bdaef' }
}

export function buildTvSlides(start: string, end: string, today: string, wallets: Array<{ id: string; nome: string }>, charges: TvCharge[], agreements: TvAgreement[], installments: TvInstallment[]) {
  return [
    { id: 'general', name: 'Visão geral', color: '#2dd4bf', foreground: '#99f6e4', metrics: buildTvMetrics(start, end, today, charges, agreements, installments) },
    ...wallets.map(wallet => ({
      id: wallet.id, name: wallet.nome, ...tvWalletTheme(wallet.nome),
      metrics: buildTvMetrics(start, end, today,
        charges.filter(row => row.carteira_id === wallet.id),
        agreements.filter(row => row.carteira_id === wallet.id),
        installments.filter(row => {
          const agreement = Array.isArray(row.acordos) ? row.acordos[0] : row.acordos
          return agreement?.carteira_id === wallet.id
        })),
    })),
  ]
}
