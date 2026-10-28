type Cobranca = {
  status?: string | null; status_operacional?: string | null; status_financeiro?: string | null
  data_pagamento?: string | null; valor_pago?: number | string | null
  duplicada_de_id?: string | null
}
const normalizar = (v: unknown) => String(v ?? '').trim().toLowerCase()

// Cancelamentos e renegociações não mantêm a cobrança presa ao plano anterior.
// Acordos quebrados permanecem bloqueados até revisão do vínculo.
export function acordoBloqueiaPre(status: unknown) {
  return !['cancelado', 'renegociado'].includes(normalizar(status))
}

export function cobrancaAbertaPre(cobranca: Cobranca) {
  return !cobranca.duplicada_de_id && !cobranca.data_pagamento &&
    !['quitado', 'pago', 'cancelado', 'renegociado'].includes(normalizar(cobranca.status_financeiro)) &&
    !['judicializado', 'acordo_firmado', 'acordo_efetivado'].includes(normalizar(cobranca.status_operacional ?? cobranca.status))
}

export function unidadeBloqueiaPre(unidade: { acao_judicial?: boolean | null; numero_processo?: string | null; conducao_processo?: string | null } | null) {
  return !unidade || unidade.acao_judicial === true || Boolean(unidade.numero_processo?.trim()) ||
    ['nosso_escritorio', 'outro_advogado'].includes(normalizar(unidade.conducao_processo))
}

export function totalizarRecortePre<T extends { unidade_id?: string | null; valor_original?: number | string | null; valor_atualizado?: number | string | null }>(rows: T[]) {
  const totais = new Map<string, { quantidade: number; centavos: number }>()
  for (const row of rows) {
    if (!row.unidade_id) continue
    const total = totais.get(row.unidade_id) ?? { quantidade: 0, centavos: 0 }
    total.quantidade++
    total.centavos += Math.round(Number(row.valor_atualizado ?? row.valor_original ?? 0) * 100)
    totais.set(row.unidade_id, total)
  }
  return rows.map(row => ({ ...row,
    quantidade_cobrancas_unidade: totais.get(row.unidade_id ?? '')?.quantidade ?? 1,
    valor_cobrancas_unidade: (totais.get(row.unidade_id ?? '')?.centavos ?? 0) / 100,
  }))
}

export function valorCasoPre(caso: { cobrancas_unidade?: Array<{ valor_atualizado?: number | string | null; valor_original?: number | string | null }> }) {
  return (caso.cobrancas_unidade ?? []).reduce((centavos, row) =>
    centavos + Math.round(Number(row.valor_atualizado ?? row.valor_original ?? 0) * 100), 0) / 100
}
