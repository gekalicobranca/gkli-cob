import { cobrancaArquivada } from '@/lib/core/cobranca-arquivamento'

type Row = {
  duplicada_de_id?: string | null; arquivada_em?: string | null
  carteira_id?: string | null; condominio_id?: string | null
  valor_atualizado?: number | string | null; valor_original?: number | string | null
  status?: string | null; status_operacional?: string | null
  carteiras?: { nome?: string } | null; condominios?: { nome?: string } | null
}

type CondominioTotal = { condominioId: string; condominio: string; centavos: number; quantidade: number }
type CarteiraTotal = {
  carteiraId: string; carteira: string; centavos: number; quantidade: number
  condominios: Map<string, CondominioTotal>
}

export type AcumuladorValoresCobrancas = {
  centavos: number
  carteiras: Map<string, CarteiraTotal>
}

export function criarAcumuladorValoresCobrancas(): AcumuladorValoresCobrancas {
  return { centavos: 0, carteiras: new Map() }
}

export function acumularValoresCobrancas(acumulador: AcumuladorValoresCobrancas, rows: Row[]) {
  for (const row of rows) {
    if (cobrancaArquivada(row)) continue
    // Os filtros da consulta já definem quais cobranças entram na lista.
    // Zerar status aqui faria o resumo divergir dos valores exibidos.
    const valor = Math.round(Number(row.valor_atualizado ?? row.valor_original ?? 0) * 100)
    const carteiraId = row.carteira_id ?? 'sem-carteira'
    const condominioId = row.condominio_id ?? 'sem-condominio'
    const carteira = acumulador.carteiras.get(carteiraId) ?? {
      carteiraId, carteira: row.carteiras?.nome ?? 'Carteira não informada',
      centavos: 0, quantidade: 0, condominios: new Map(),
    }
    const condominio = carteira.condominios.get(condominioId) ?? {
      condominioId, condominio: row.condominios?.nome ?? 'Condomínio não informado', centavos: 0, quantidade: 0,
    }
    acumulador.centavos += valor
    carteira.centavos += valor
    carteira.quantidade++
    condominio.centavos += valor
    condominio.quantidade++
    carteira.condominios.set(condominioId, condominio)
    acumulador.carteiras.set(carteiraId, carteira)
  }
}

export function finalizarAcumuladorValoresCobrancas(acumulador: AcumuladorValoresCobrancas) {
  return {
    totalEmAberto: acumulador.centavos / 100,
    porCarteira: [...acumulador.carteiras.values()].map(({ centavos, condominios, ...carteira }) => ({
      ...carteira, valor: centavos / 100,
      condominios: [...condominios.values()].map(({ centavos, ...condominio }) => ({ ...condominio, valor: centavos / 100 })),
    })),
  }
}

export function resumirValoresCobrancas(rows: Row[]) {
  const acumulador = criarAcumuladorValoresCobrancas()
  acumularValoresCobrancas(acumulador, rows)
  return finalizarAcumuladorValoresCobrancas(acumulador)
}
