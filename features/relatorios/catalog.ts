import { Banknote, Building2, FileSpreadsheet, Handshake, Landmark, Layers3 } from 'lucide-react'
import type { RelatorioTipo } from './types'

export const relatorioCards: Array<{
  tipo: RelatorioTipo
  title: string
  description: string
  icon: any
  eixo: string
  sintetico: string
  detalhado: string
  metricLabel: string
}> = [
  {
    tipo: 'carteiras-condominios',
    title: 'Carteiras / Condomínios',
    description: 'Distribuição da base por carteira, status cadastral e vínculos operacionais.',
    icon: Layers3,
    eixo: 'Governança da carteira',
    sintetico: 'lista de carteiras com quantidade de condomínios por status',
    detalhado: 'ficha da carteira com condomínios vinculados e administradora',
    metricLabel: 'condomínios',
  },
  {
    tipo: 'condominios-administradoras',
    title: 'Condomínios / Administradoras',
    description: 'Mapa de administradoras com seus condomínios, carteiras e situação cadastral.',
    icon: Landmark,
    eixo: 'Base cadastral',
    sintetico: 'lista de administradoras com volume de condomínios',
    detalhado: 'ficha da administradora com condomínios e carteiras vinculadas',
    metricLabel: 'condomínios',
  },
  {
    tipo: 'condominios-cobrancas',
    title: 'Condomínios / Cobranças',
    description: 'Visão financeira por condomínio: cobranças, valores em aberto e status operacional.',
    icon: Banknote,
    eixo: 'Carteira ativa',
    sintetico: 'lista de condomínios com totais de cobrança',
    detalhado: 'ficha do condomínio com cobranças por unidade/responsável',
    metricLabel: 'cobranças',
  },
  {
    tipo: 'condominios-acordos',
    title: 'Condomínios / Acordos',
    description: 'Acompanhamento de acordos por condomínio, valor negociado, tipo e status.',
    icon: Handshake,
    eixo: 'Negociação',
    sintetico: 'lista de condomínios com totais de acordos',
    detalhado: 'ficha do condomínio com acordos por unidade/responsável',
    metricLabel: 'acordos',
  },
]

export function getRelatorioCard(tipo: string) {
  return relatorioCards.find((card) => card.tipo === tipo) ?? relatorioCards[0]
}

export const relatorioIconFallback = Building2
export const relatorioExportIcon = FileSpreadsheet
