import type { ContextoMensagem, ReguaTom } from './types'

const FALLBACK_COBRANCA = {
  leve:
    'Olá, {{responsavel}}. Identificamos um débito em aberto da unidade {{unidade}} no {{condominio}}, competência {{competencia}}, vencido em {{vencimento}}. Podemos auxiliar na regularização?',
  medio:
    'Olá, {{responsavel}}. Consta pendência da unidade {{unidade}} no {{condominio}}, competência {{competencia}}, valor atualizado {{valor}}. Podemos seguir com a regularização?',
  agressivo:
    'Olá, {{responsavel}}. O débito da unidade {{unidade}} no {{condominio}} segue em aberto. Para evitar avanço da cobrança, regularize o quanto antes ou solicite atendimento.',
} satisfies Record<ReguaTom, string>

const FALLBACK_ACORDO = {
  leve:
    'Olá, {{responsavel}}. Identificamos parcela de acordo em aberto da unidade {{unidade}}, vencida em {{vencimento}}. Podemos auxiliar na regularização?',
  medio:
    'Olá, {{responsavel}}. Seu acordo da unidade {{unidade}} está com parcela vencida desde {{vencimento}}. Regularize para manter as condições pactuadas.',
  agressivo:
    'Olá, {{responsavel}}. O acordo da unidade {{unidade}} segue inadimplente. A ausência de regularização poderá caracterizar quebra do acordo.',
} satisfies Record<ReguaTom, string>

export function fallbackTemplate(tipo: 'cobranca' | 'acordo', tom: ReguaTom) {
  return tipo === 'acordo' ? FALLBACK_ACORDO[tom] : FALLBACK_COBRANCA[tom]
}

export function renderTemplate(template: string, contexto: ContextoMensagem) {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_match, key: string) => {
    const value = contexto[key]
    return value === null || value === undefined ? '' : String(value)
  })
}

export function ajustarTom(template: string, intensidade: ReguaTom) {
  if (intensidade === 'leve') {
    return template
      .replace(/regularize o quanto antes/gi, 'podemos auxiliar na regularização')
      .replace(/evitar avanço da cobrança/gi, 'manter a situação sob controle')
      .replace(/poderá caracterizar quebra do acordo/gi, 'pode comprometer as condições do acordo')
  }

  if (intensidade === 'agressivo') {
    return template
      .replace(/podemos auxiliar na regularização/gi, 'é necessário regularizar o quanto antes')
      .replace(/podemos seguir com a regularização/gi, 'é necessário regularizar imediatamente')
      .replace(/podemos auxiliar/gi, 'é necessário regularizar')
  }

  return template
}
