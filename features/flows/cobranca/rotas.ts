export type CanalFlowCobranca = 'email' | 'whatsapp'
export type OrdemFlowCobranca = 'criacao_desc' | 'agenda_asc' | 'agenda_desc'

export function flowCobrancaOrdem(value: unknown): OrdemFlowCobranca {
  return value === 'agenda_asc' || value === 'agenda_desc' ? value : 'criacao_desc'
}
export type FlowCobrancaAba = 'flows' | 'gerar' | 'saneamento' | 'historico' | 'maestro'

export function flowCobrancaStatus(value: unknown, aba: FlowCobrancaAba) {
  const statuses = aba === 'flows' ? ['pronto', 'em_execucao', 'pausado']
    : aba === 'historico' ? ['concluido', 'concluido_com_falhas', 'cancelado'] : []
  return typeof value === 'string' && statuses.includes(value) ? value : undefined
}

export function flowCobrancaTabQuery(query: string, origem: FlowCobrancaAba, destino: FlowCobrancaAba) {
  const atual = new URLSearchParams(query)
  const params = new URLSearchParams({ aba: destino })
  for (const key of ['canal', 'carteira', 'condominio']) {
    const value = atual.get(key)
    if (value) params.set(key, value)
  }
  const grupo = (aba: FlowCobrancaAba) => aba === 'gerar' || aba === 'saneamento' ? 'cobrancas'
    : aba === 'flows' || aba === 'historico' ? 'monitor' : 'maestro'
  if (grupo(origem) === grupo(destino) && destino !== 'maestro') {
    for (const key of ['inclusao_de', 'inclusao_ate', ...(grupo(destino) === 'cobrancas' ? ['vencimento_de', 'vencimento_ate'] : ['ordenar'])]) {
      const value = atual.get(key)
      if (value) params.set(key, value)
    }
  }
  const status = origem === destino ? flowCobrancaStatus(atual.get('status'), destino) : undefined
  if (status) params.set('status', status)
  return params.toString()
}

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
