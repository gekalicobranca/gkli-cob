export const PRE_JURIDICO_ETAPAS = [
  { id: 'aguardando_documentos', label: 'Confirmar propriedade', shortLabel: 'Propriedade' },
  { id: 'aguardando_sindico', label: 'Procuração', shortLabel: 'Procuração' },
  { id: 'confirmar_juridico', label: 'Confirmar jurídico', shortLabel: 'Confirmar jurídico' },
  { id: 'pronto_juridico', label: 'Pronto para o jurídico', shortLabel: 'Pronto' },
  { id: 'enviado_juridico', label: 'Enviado ao jurídico', shortLabel: 'Enviado' },
  { id: 'analise_juridica', label: 'Análise jurídica', shortLabel: 'Análise' },
  { id: 'pendencia_juridica', label: 'Pendência jurídica', shortLabel: 'Pendência' },
  { id: 'autorizado_ajuizamento', label: 'Autorizado', shortLabel: 'Autorizado' },
  { id: 'judicializado', label: 'Judicializado', shortLabel: 'Judicializado' },
] as const

export type PreJuridicoEtapa = (typeof PRE_JURIDICO_ETAPAS)[number]['id']

export function etapaPreJuridicoLabel(etapa: string | null | undefined) {
  return PRE_JURIDICO_ETAPAS.find((item) => item.id === etapa)?.label ?? 'Etapa não informada'
}

export function proximaEtapaPreJuridico(etapa: PreJuridicoEtapa): PreJuridicoEtapa | null {
  if (etapa === 'pendencia_juridica') return 'analise_juridica'
  const index = PRE_JURIDICO_ETAPAS.findIndex((item) => item.id === etapa)
  if (index < 0 || index >= PRE_JURIDICO_ETAPAS.length - 1) return null
  return PRE_JURIDICO_ETAPAS[index + 1].id
}
