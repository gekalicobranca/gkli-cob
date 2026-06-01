export type OperationalAISignal = {
  label: string
  value: string
  tone: 'success' | 'warning' | 'danger' | 'info'
}

export type NextBestAction = {
  title: string
  description: string
  confidence: number
  actionLabel: string
  href?: string
}

export function getMockOperationalSignals(): OperationalAISignal[] {
  return [
    {
      label: 'Chance de acordo',
      value: 'Alta',
      tone: 'success',
    },
    {
      label: 'Risco de silêncio',
      value: 'Médio',
      tone: 'warning',
    },
    {
      label: 'Melhor horário',
      value: 'Após 18h',
      tone: 'info',
    },
  ]
}

export function getMockNextBestAction(): NextBestAction {
  return {
    title: 'Retomar negociação com proposta objetiva',
    description:
      'O caso possui boa chance de acordo. Recomenda-se contato curto com opção de entrada reduzida e vencimento próximo.',
    confidence: 82,
    actionLabel: 'Iniciar contato',
  }
}

export function getSignalToneClasses(tone: OperationalAISignal['tone']) {
  switch (tone) {
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'danger':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    default:
      return 'border-sky-200 bg-sky-50 text-sky-700'
  }
}
