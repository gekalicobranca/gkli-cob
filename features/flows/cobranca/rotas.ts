export type CanalFlowCobranca = 'email' | 'whatsapp'
export type FlowCobrancaAba = 'flows' | 'gerar' | 'saneamento' | 'historico' | 'maestro'

export function flowCobrancaAba(value: unknown, canal: CanalFlowCobranca, step?: string): FlowCobrancaAba {
  if (value === 'maestro') return canal === 'email' ? 'maestro' : 'flows'
  if (value === 'gerar' || value === 'saneamento' || value === 'historico' || value === 'flows') return value
  return step === 'lotes' ? 'gerar' : 'flows'
}

export function flowCobrancaPagina(value: unknown) {
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10000) : 1
}

export function canalFlowCobranca(value: unknown): CanalFlowCobranca {
  return value === 'whatsapp' ? 'whatsapp' : 'email'
}

export function flowCobrancaPath(canal: CanalFlowCobranca) {
  return `/app/flows/cobranca/${canal}`
}
