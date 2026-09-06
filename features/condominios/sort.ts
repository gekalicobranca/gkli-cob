function normalizeText(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function sortCondominios(rows: any[], ordenar: string) {
  const field = ordenar || 'nome'
  return [...rows].sort((a, b) => {
    const getValue = (row: any) => {
      if (field === 'administradora') return normalizeText(row.administradora)
      if (field === 'status') return normalizeText(row.status)
      if (field === 'carteira') return normalizeText(row.carteiras?.nome)
      if (field === 'regua_asc' || field === 'regua_desc') return Number(row.inicio_cobranca_dias ?? 0)
      if (field === 'cota_asc' || field === 'cota_desc') return Number(row.valor_cota_condominial ?? 0)
      return normalizeText(row.nome_operacional || row.nome)
    }
    const av = getValue(a)
    const bv = getValue(b)
    if (typeof av === 'number' && typeof bv === 'number') return field.endsWith('_desc') ? bv - av : av - bv
    return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true })
  })
}
