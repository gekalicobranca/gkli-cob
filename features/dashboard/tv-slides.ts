import { buildTvMetrics, type TvCharge, type TvAgreement, type TvInstallment } from './tv-metrics'

export function tvWalletTheme(name: string) {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (normalized.includes('escritorio') && normalized.includes('genske')) return { color: '#b3679b', foreground: '#f1c8e4' }
  if (normalized.includes('genske')) return { color: '#351b40', foreground: '#e3c9ed' }
  if (normalized.includes('gekali')) return { color: '#03658C', foreground: '#8bdaef' }
  if (normalized.includes('azevedo')) return { color: '#FCA17D', foreground: '#FCA17D' }
  return { color: '#03658C', foreground: '#8bdaef' }
}

const normalizeGroup = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
const isAzevedo = (name: string) => ['azevedo', 'azevedo araujo'].includes(normalizeGroup(name))

export function buildTvSlides(start: string, end: string, today: string, wallets: Array<{ id: string; nome: string }>, charges: TvCharge[], agreements: TvAgreement[], installments: TvInstallment[], condominiums: Array<{ id: string; grupo: string | null }> = []) {
  // Os dados recebidos já respeitam as carteiras permitidas ao usuário.
  const azevedoIds = new Set(condominiums.filter(row => isAzevedo(row.grupo ?? '')).map(row => row.id))
  return [
    { id: 'general', kind: 'general', name: 'Visão geral', color: '#2dd4bf', foreground: '#99f6e4', metrics: buildTvMetrics(start, end, today, charges, agreements, installments) },
    ...wallets.filter(wallet => !isAzevedo(wallet.nome)).map(wallet => ({
      id: wallet.id, kind: 'wallet', name: wallet.nome, ...tvWalletTheme(wallet.nome),
      metrics: buildTvMetrics(start, end, today,
        charges.filter(row => row.carteira_id === wallet.id),
        agreements.filter(row => row.carteira_id === wallet.id),
        installments.filter(row => {
          const agreement = Array.isArray(row.acordos) ? row.acordos[0] : row.acordos
          return agreement?.carteira_id === wallet.id
        })),
    })),
    ...(azevedoIds.size || wallets.some(wallet => isAzevedo(wallet.nome)) ? [{
      id: 'group:azevedo', kind: 'group', name: 'Grupo Azevedo Araújo', ...tvWalletTheme('Azevedo Araújo'),
      metrics: buildTvMetrics(start, end, today,
        charges.filter(row => Boolean(row.condominio_id && azevedoIds.has(row.condominio_id))),
        agreements.filter(row => Boolean(row.condominio_id && azevedoIds.has(row.condominio_id))),
        installments.filter(row => {
          const agreement = Array.isArray(row.acordos) ? row.acordos[0] : row.acordos
          return Boolean(agreement?.condominio_id && azevedoIds.has(agreement.condominio_id))
        })),
    }] : []),
  ]
}
