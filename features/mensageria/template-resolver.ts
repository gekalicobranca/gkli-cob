import { createAdminClient } from '@/utils/supabase/admin'
import { renderTemplate, type TemplateVariables } from './render-template'

export type TemplateResolveInput = {
  carteiraId?: string | null
  tipoRegua: 'cobranca' | 'acordo' | string
  categoria?: string | null
  intensidade?: string | null
  canal?: string | null
  templateId?: string | null
  fallbackText?: string | null
  variables?: TemplateVariables
}

export type ResolvedTemplate = {
  templateId: string | null
  origem: 'template_id' | 'carteira' | 'global' | 'fallback'
  nome: string | null
  assunto: string | null
  conteudo: string
  renderizado: string
}

const DEFAULTS: Record<string, string> = {
  cobranca_inicial: 'Olá, {{primeiro_nome}}. Identificamos uma pendência da unidade {{unidade}} no {{condominio}}, vinculada à {{carteira}}. Valor atualizado: {{valor}}. Podemos auxiliar na regularização?',
  cobranca_media: 'Olá, {{primeiro_nome}}. A unidade {{unidade}} do {{condominio}} segue com débito em aberto de {{valor}}. Para evitar avanço da cobrança, regularize ou fale conosco.',
  pre_juridico: 'Olá, {{primeiro_nome}}. O débito da unidade {{unidade}} no {{condominio}} permanece em aberto. A ausência de regularização poderá levar ao encaminhamento jurídico.',
  lembrete_acordo: 'Olá, {{primeiro_nome}}. Lembramos que a parcela {{parcela}} do acordo da unidade {{unidade}} vence em {{vencimento}}. Valor: {{valor_parcela}}.',
  vencimento_acordo: 'Olá, {{primeiro_nome}}. Sua parcela {{parcela}} do acordo vence hoje. Valor: {{valor_parcela}}. Evite a quebra do acordo.',
  atraso_acordo: 'Olá, {{primeiro_nome}}. Identificamos atraso na parcela {{parcela}} do acordo da unidade {{unidade}}. Podemos ajudar na regularização?',
  quebra_acordo: 'Olá, {{primeiro_nome}}. O acordo da unidade {{unidade}} está em risco de rompimento. Regularize a parcela em aberto para manter as condições pactuadas.',
  pre_juridico_carteira: 'Olá, {{primeiro_nome}}. O pacote pré-jurídico da unidade {{unidade}} do {{condominio}} está pronto. Laudo: {{link_laudo}}. Procuração: {{link_procuracao}}.',
  pre_juridico_administradora: 'Olá, {{primeiro_nome}}. Segue a lista pré-jurídica dos acordos quebrados vinculados à administradora {{administradora}}. Lista: {{link_lista_administradora}}.',
  pre_juridico_sindico: 'Olá, {{primeiro_nome}}. Segue a procuração para assinatura referente à unidade {{unidade}} do {{condominio}}. Procuração: {{link_procuracao}}.',
  manual: 'Olá, {{primeiro_nome}}. Entramos em contato pela {{carteira}} sobre a unidade {{unidade}} do {{condominio}}.',
}

function categoriaDefault(tipoRegua: string, categoria?: string | null) {
  if (categoria) return categoria
  return tipoRegua === 'acordo' ? 'lembrete_acordo' : 'cobranca_inicial'
}

export async function resolveTemplateMensagem(input: TemplateResolveInput): Promise<ResolvedTemplate> {
  const supabase = createAdminClient()
  const categoria = categoriaDefault(String(input.tipoRegua), input.categoria)
  const canal = input.canal || 'whatsapp'
  const intensidade = input.intensidade || 'medio'
  const variables = input.variables ?? {}

  async function byId() {
    if (!input.templateId) return null
    const { data } = await supabase
      .from('mensagens_templates')
      .select('id,nome,assunto,conteudo')
      .eq('id', input.templateId)
      .eq('ativo', true)
      .maybeSingle()
    return data as any | null
  }

  async function byScope(carteira: string | null) {
    let query = supabase
      .from('mensagens_templates')
      .select('id,nome,assunto,conteudo')
      .eq('ativo', true)
      .eq('tipo_regua', input.tipoRegua)
      .eq('categoria', categoria)
      .eq('intensidade', intensidade)
      .eq('canal', canal)
      .order('prioridade', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1)

    query = carteira ? query.eq('carteira_id', carteira) : query.is('carteira_id', null)
    const { data } = await query.maybeSingle()
    return data as any | null
  }

  const explicit = await byId()
  if (explicit?.conteudo) {
    return { templateId: explicit.id, origem: 'template_id', nome: explicit.nome, assunto: explicit.assunto, conteudo: explicit.conteudo, renderizado: renderTemplate(explicit.conteudo, variables) }
  }

  const carteiraTemplate = input.carteiraId ? await byScope(input.carteiraId) : null
  if (carteiraTemplate?.conteudo) {
    return { templateId: carteiraTemplate.id, origem: 'carteira', nome: carteiraTemplate.nome, assunto: carteiraTemplate.assunto, conteudo: carteiraTemplate.conteudo, renderizado: renderTemplate(carteiraTemplate.conteudo, variables) }
  }

  const globalTemplate = await byScope(null)
  if (globalTemplate?.conteudo) {
    return { templateId: globalTemplate.id, origem: 'global', nome: globalTemplate.nome, assunto: globalTemplate.assunto, conteudo: globalTemplate.conteudo, renderizado: renderTemplate(globalTemplate.conteudo, variables) }
  }

  const fallback = input.fallbackText || DEFAULTS[categoria] || DEFAULTS.manual
  return { templateId: null, origem: 'fallback', nome: 'Fallback GKLI', assunto: null, conteudo: fallback, renderizado: renderTemplate(fallback, variables) }
}
