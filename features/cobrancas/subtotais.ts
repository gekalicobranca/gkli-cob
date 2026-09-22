import { getCobrancaStatusOperacional } from '@/lib/core/cobranca-status'

type Row = {
  carteira_id?: string | null; condominio_id?: string | null
  valor_atualizado?: number | string | null; valor_original?: number | string | null
  status?: string | null; status_operacional?: string | null
  carteiras?: { nome?: string } | null; condominios?: { nome?: string } | null
}

export function resumirValoresCobrancas(rows: Row[]) {
  const excluidos = new Set(['acordo_efetivado', 'pre_juridico', 'judicializado', 'suspenso'])
  const carteiras = new Map<string, {
    carteiraId: string; carteira: string; centavos: number; quantidade: number
    condominios: Map<string, { condominioId: string; condominio: string; centavos: number; quantidade: number }>
  }>()
  let centavos = 0
  for (const row of rows) {
    const valor = excluidos.has(getCobrancaStatusOperacional(row)) ? 0
      : Math.round(Number(row.valor_atualizado ?? row.valor_original ?? 0) * 100)
    const carteiraId = row.carteira_id ?? 'sem-carteira'
    const condominioId = row.condominio_id ?? 'sem-condominio'
    const carteira = carteiras.get(carteiraId) ?? {
      carteiraId, carteira: row.carteiras?.nome ?? 'Carteira não informada',
      centavos: 0, quantidade: 0, condominios: new Map(),
    }
    const condominio = carteira.condominios.get(condominioId) ?? {
      condominioId, condominio: row.condominios?.nome ?? 'Condomínio não informado', centavos: 0, quantidade: 0,
    }
    centavos += valor
    carteira.centavos += valor
    carteira.quantidade++
    condominio.centavos += valor
    condominio.quantidade++
    carteira.condominios.set(condominioId, condominio)
    carteiras.set(carteiraId, carteira)
  }
  return {
    totalEmAberto: centavos / 100,
    porCarteira: [...carteiras.values()].map(({ centavos, condominios, ...carteira }) => ({
      ...carteira, valor: centavos / 100,
      condominios: [...condominios.values()].map(({ centavos, ...condominio }) => ({ ...condominio, valor: centavos / 100 })),
    })),
  }
}
