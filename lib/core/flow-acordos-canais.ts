export type CanalFlowAcordos = 'email' | 'whatsapp'
export function etapasDoCanal<T extends { canal?: string | null; ativo?: boolean | null }>(etapas: T[], canal?: CanalFlowAcordos) {
  return etapas.filter(etapa => etapa.ativo !== false && (!canal || etapa.canal === canal))
}
