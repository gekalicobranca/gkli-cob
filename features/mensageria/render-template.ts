export type TemplateVariables = Record<
  string,
  string | number | null | undefined
>

export const SAMPLE_TEMPLATE_VARIABLES: TemplateVariables = {
  nome: 'João da Silva',
  primeiro_nome: 'João',
  condominio: 'Condomínio Modelo GKLI',
  unidade: '101',
  bloco: 'A',
  valor: 'R$ 1.250,00',
  valor_acordo: 'R$ 1.100,00',
  telefone: '(11) 99999-9999',
  pix: 'pix@gkli.com.br',
  link_boleto: 'https://gkli.com.br/boleto-exemplo',
}

export const TEMPLATE_VARIABLES = [
  'nome',
  'primeiro_nome',
  'condominio',
  'unidade',
  'bloco',
  'valor',
  'valor_acordo',
  'telefone',
  'pix',
  'link_boleto',
]

export function renderTemplate(
  template: string,
  variables: TemplateVariables = SAMPLE_TEMPLATE_VARIABLES,
) {
  let result = template || ''

  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g')

    result = result.replace(regex, String(value ?? ''))
  })

  return result
}

export function extractFirstName(nome?: string | null) {
  if (!nome) return ''

  return nome.trim().split(' ')[0] ?? ''
}