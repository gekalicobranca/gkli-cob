import type { KeilaCasoPayload } from './casos'

export function formalizacoesPendentes(payload: Pick<KeilaCasoPayload, 'acordos' | 'acompanhamento'>) {
  return (payload.acordos ?? []).filter(a => a.etapa === 'acordo_firmado' && a.formalizacao?.status === 'pendente'
    && !payload.acompanhamento?.pendencias.some(p => p.id === `formalizar-acordo:${a.id}` && p.resolvida_em))
}
