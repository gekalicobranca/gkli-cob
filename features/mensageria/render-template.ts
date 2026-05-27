export type TemplateVariables = Record<string, string | number | null | undefined>

export const TEMPLATE_CATEGORIES = [
  'cobranca_inicial',
  'cobranca_media',
  'pre_juridico',
  'lembrete_acordo',
  'vencimento_acordo',
  'atraso_acordo',
  'quebra_acordo',
  'manual',
] as const

export const TEMPLATE_INTENSITIES = ['leve', 'medio', 'agressivo'] as const
export const TEMPLATE_CHANNELS = ['whatsapp', 'email', 'sms', 'manual'] as const

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]
export type TemplateIntensity = (typeof TEMPLATE_INTENSITIES)[number]
export type TemplateChannel = (typeof TEMPLATE_CHANNELS)[number]

export const SAMPLE_TEMPLATE_VARIABLES: TemplateVariables = {
  carteira: 'Carteira GKLI Modelo',
  nome_carteira: 'Carteira GKLI Modelo',
  operador: 'Operador GKLI',
  telefone_operador: '(11) 4000-0000',
  nome: 'João da Silva',
  responsavel: 'João da Silva',
  primeiro_nome: 'João',
  condominio: 'Condomínio Modelo GKLI',
  cnpj_condominio: '12.345.678/0001-90',
  unidade: '101',
  bloco: 'A',
  competencia: '05/2026',
  valor: 'R$ 1.250,00',
  valor_total: 'R$ 1.250,00',
  valor_acordo: 'R$ 1.100,00',
  vencimento: '10/05/2026',
  dias_atraso: 17,
  telefone: '(11) 99999-9999',
  email: 'joao@email.com',
  pix: 'pix@gkli.com.br',
  linha_digitavel: '00000.00000 00000.000000 00000.000000 0 00000000000000',
  link_boleto: 'https://gkli.com.br/boleto-exemplo',
  link_acordo: 'https://gkli.com.br/acordo-exemplo',
  parcela: '2',
  parcela_numero: '2',
  quantidade_parcelas: '6',
  valor_parcela: 'R$ 220,00',
}

export const TEMPLATE_VARIABLES = Object.keys(SAMPLE_TEMPLATE_VARIABLES)

export function renderTemplate(template: string, variables: TemplateVariables = SAMPLE_TEMPLATE_VARIABLES) {
  return (template || '').replace(/{{\s*([\w.]+)\s*}}/g, (_match, key: string) => String(variables[key] ?? ''))
}

export function extractFirstName(nome?: string | null) {
  if (!nome) return ''
  return nome.trim().split(' ')[0] ?? ''
}

export function categoryLabel(value?: string | null) {
  const labels: Record<string, string> = {
    cobranca_inicial: 'Cobrança inicial',
    cobranca_media: 'Cobrança média',
    pre_juridico: 'Pré-jurídico',
    lembrete_acordo: 'Lembrete de acordo',
    vencimento_acordo: 'Vencimento de acordo',
    atraso_acordo: 'Atraso de acordo',
    quebra_acordo: 'Quebra de acordo',
    manual: 'Manual',
  }
  return labels[value ?? ''] ?? 'Manual'
}

export function intensityLabel(value?: string | null) {
  const labels: Record<string, string> = { leve: 'Leve', medio: 'Médio', agressivo: 'Agressivo' }
  return labels[value ?? ''] ?? 'Médio'
}
