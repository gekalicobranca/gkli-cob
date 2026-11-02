export const PRE_JURIDICO_ETAPAS = [
  { id: 'aguardando_documentos', label: 'Confirmar propriedade', shortLabel: 'Propriedade' },
  { id: 'aguardando_sindico', label: 'Procuração', shortLabel: 'Procuração' },
  { id: 'confirmar_juridico', label: 'Confirmar jurídico', shortLabel: 'Confirmar jurídico' },
  { id: 'enviado_juridico', label: 'Enviado ao jurídico', shortLabel: 'Enviado' },
  { id: 'analise_juridica', label: 'Análise jurídica', shortLabel: 'Análise' },
  { id: 'pendencia_juridica', label: 'Pendência jurídica', shortLabel: 'Pendência' },
  { id: 'autorizado_ajuizamento', label: 'Autorizado', shortLabel: 'Autorizado' },
  { id: 'pronto_juridico', label: 'Distribuição', shortLabel: 'Distribuição' },
  { id: 'judicializado', label: 'Judicializado', shortLabel: 'Judicializado' },
] as const

export type PreJuridicoEtapa = (typeof PRE_JURIDICO_ETAPAS)[number]['id']

export function etapaPreJuridicoLabel(etapa: string | null | undefined) {
  return PRE_JURIDICO_ETAPAS.find((item) => item.id === etapa)?.label ?? 'Etapa não informada'
}

export function proximaEtapaPreJuridico(etapa: PreJuridicoEtapa): PreJuridicoEtapa | null {
  return transicoesPreJuridico(etapa)[0] ?? null
}

export function transicoesPreJuridico(etapa: string): readonly PreJuridicoEtapa[] {
  const mapa: Record<string, PreJuridicoEtapa[]> = {
    aguardando_documentos: ['aguardando_sindico'], aguardando_sindico: ['confirmar_juridico'],
    confirmar_juridico: ['enviado_juridico'], enviado_juridico: ['analise_juridica'],
    analise_juridica: ['autorizado_ajuizamento', 'pendencia_juridica'],
    pendencia_juridica: ['analise_juridica'], autorizado_ajuizamento: ['pronto_juridico'],
    pronto_juridico: ['judicializado', 'analise_juridica', 'aguardando_documentos'], judicializado: [],
  }
  return mapa[etapa] ?? []
}
