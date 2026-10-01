import { reguasDisponiveis } from './canais'

const relation = (value: any) => Array.isArray(value) ? value[0] : value

export function selecionarCondominiosIniciais(rows: any[], selectedIds: string[]) {
  const condominios = new Set(rows.map(row => row.condominio_id))
  if (condominios.size === 1) return [...condominios] as string[]
  const ids = new Set(selectedIds)
  return [...new Set<string>(rows.filter(row => ids.has(row.id)).map(row => row.condominio_id))]
}

export function agruparCobrancasFlow(rows: any[]) {
  const groups = new Map<string, { condominioId: string; condominioNome: string; reguaId?: string; carteiraId: string; carteiraNome: string; rows: any[]; total: number }>()
  for (const row of rows) {
    const carteiraId = String(row.carteira_id ?? '')
    const condominioId = String(row.condominio_id ?? '')
    if (!carteiraId || !condominioId) continue
    const condominio = relation(row.condominio)
    const group = groups.get(condominioId) ?? {
      condominioId, condominioNome: condominio?.nome_operacional || condominio?.nome || 'Condomínio',
      reguaId: condominio?.regua_cobranca_id, carteiraId,
      carteiraNome: relation(row.carteira)?.nome ?? 'Carteira', rows: [], total: 0,
    }
    group.rows.push(row)
    group.total += Number(row.valor_atualizado ?? row.valor_original ?? 0)
    groups.set(condominioId, group)
  }
  return [...groups.values()].sort((a, b) => a.condominioNome.localeCompare(b.condominioNome, 'pt-BR'))
}

// Calcula a disponibilidade de cada cobrança uma vez por atualização dos dados.
export function avaliarGruposFlow(rows: any[], reguas: any[]) {
  return agruparCobrancasFlow(rows).map(grupo => {
    const reguasPorCobranca = new Map<string, Set<string>>()
    const ids = new Set<string>()
    for (const row of grupo.rows) {
      const disponiveis = new Set<string>(reguasDisponiveis(row, reguas).map(regua => regua.id))
      reguasPorCobranca.set(row.id, disponiveis)
      for (const id of disponiveis) ids.add(id)
    }
    return { ...grupo, reguasPorCobranca, opcoesRegua: reguas.filter(regua => ids.has(regua.id)) }
  })
}

export function selecionarReguaGrupo(grupo: ReturnType<typeof avaliarGruposFlow>[number], escolhida?: string) {
  const opcoes = grupo.opcoesRegua
  return opcoes.find(regua => regua.id === escolhida)?.id
    ?? opcoes.find(regua => regua.carteira_id === grupo.carteiraId && regua.id === grupo.reguaId)?.id
    ?? opcoes.find(regua => regua.carteira_id === grupo.carteiraId)?.id
    ?? opcoes.find(regua => regua.id === grupo.reguaId)?.id
    ?? opcoes[0]?.id ?? ''
}
