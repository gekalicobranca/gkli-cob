// Limita o trabalho por chamada sem separar as parcelas da mesma unidade.
export const LIMITE_EMAILS_FLOW = 20
export const ALVO_COBRANCAS_FLOW = 20
export const LIMITE_COBRANCAS_CHAMADA = 40

export function dividirCriacaoFlows<T extends { id: string; unidade_id?: string | null }>(rows: T[]): T[][] {
  const unidades = new Map<string, T[]>()
  for (const row of rows) {
    const key = row.unidade_id || row.id
    const grupo = unidades.get(key) ?? []
    grupo.push(row)
    unidades.set(key, grupo)
  }
  const partes: T[][] = []
  let atual: T[] = []
  for (const grupo of unidades.values()) {
    if (grupo.length > LIMITE_COBRANCAS_CHAMADA) {
      throw new Error('Uma unidade tem mais de 40 cobranças selecionadas. Reduza o período do filtro para criar seus flows.')
    }
    if (atual.length && atual.length + grupo.length > ALVO_COBRANCAS_FLOW) {
      partes.push(atual)
      atual = []
    }
    atual.push(...grupo)
  }
  if (atual.length) partes.push(atual)
  return partes
}
