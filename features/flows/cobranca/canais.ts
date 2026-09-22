type Etapa = { canal?: string | null; ativo?: boolean | null }

export function canaisDaRegua(regua: { etapas?: Etapa[] | null }) {
  return [...new Set((regua.etapas ?? []).filter(e => e.ativo !== false).map(e => e.canal || 'whatsapp'))]
}

export function conflitoDeCanais(ocupados: Iterable<string>, solicitados: string[]) {
  const usados = new Set(ocupados)
  return usados.has('*') || solicitados.some(canal => usados.has(canal))
}

export function filtrarFlowsPorCanal<T extends { canais?: string[] }>(flows: T[], canal?: string) {
  return canal ? flows.filter(flow => flow.canais?.includes(canal)) : flows
}

export function filtrarReguasPorCanal<T extends { etapas?: Etapa[] | null }>(reguas: T[], canal?: string) {
  return canal ? reguas.filter(regua => canaisDaRegua(regua).includes(canal)) : reguas
}

export function reguasDisponiveis(row: { carteira_id?: string; canais_ocupados?: string[] }, reguas: any[]) {
  return reguas.filter(regua => (!regua.carteira_id || regua.carteira_id === row.carteira_id)
    && canaisDaRegua(regua).length > 0 && !conflitoDeCanais(row.canais_ocupados ?? [], canaisDaRegua(regua)))
}
