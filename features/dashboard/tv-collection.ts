import type { TvAgreement, TvCharge } from './tv-metrics'

export const TV_COLLECTION_AGREEMENT_STATUSES = ['ativo', 'em_dia', 'em_atraso', 'quitado']
export type TvAgreementLink = { cobranca_id: string; acordos: { status: string | null } | { status: string | null }[] | null }

function blocksCollection(status?: string | null) {
  return TV_COLLECTION_AGREEMENT_STATUSES.includes((status ?? '').trim().toLowerCase())
}

// Aplicar antes de separar as carteiras: o bloqueio jurídico pertence à unidade inteira.
export function prepareTvCollectionCharges(charges: TvCharge[], judicialRows: Array<{ unidade_id: string | null }>, agreements: TvAgreement[], links: TvAgreementLink[]) {
  const judicialUnits = new Set(judicialRows.map(row => row.unidade_id).filter(Boolean))
  const contractedCharges = new Set(agreements.filter(row => blocksCollection(row.status)).map(row => row.cobranca_id).filter(Boolean))
  for (const link of links) {
    const agreement = Array.isArray(link.acordos) ? link.acordos[0] : link.acordos
    if (blocksCollection(agreement?.status)) contractedCharges.add(link.cobranca_id)
  }
  return charges.map(row => {
    const unit = Array.isArray(row.unidades) ? row.unidades[0] : row.unidades
    return {
      ...row,
      bloqueada_para_captacao: Boolean(row.bloqueada_para_captacao || unit?.acao_judicial
        || (row.unidade_id && judicialUnits.has(row.unidade_id))
        || (row.id && contractedCharges.has(row.id))),
    }
  })
}
