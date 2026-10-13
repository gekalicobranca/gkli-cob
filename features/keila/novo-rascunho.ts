import type { KeilaCasoPayload } from './casos'

/** Cada retorno exige sua própria aprovação; uma mensagem liberada é imutável. */
export function prepararNovoRascunho(payload: KeilaCasoPayload, emailChave: string, texto: string, statusAnterior?: string): KeilaCasoPayload {
  const aprovada = payload.resposta_aprovada
  if (aprovada) {
    const origem = aprovada.email_chave ?? payload.emails.filter(e => new Date(e.recebido_em) <= new Date(aprovada.em)).at(-1)?.chave
    if (origem === emailChave) throw new Error('Esta mensagem já tem resposta aprovada. Preserve o texto liberado.')
    if (!['enviada', 'cancelada'].includes(statusAnterior ?? '')) throw new Error('Existe resposta aprovada com envio pendente ou incerto. Confira antes de preparar outra resposta.')
  }
  return { ...payload, resposta_simulada: texto, resposta_email_chave: emailChave,
    ...(payload.resposta_email_chave !== emailChave ? { resposta_anexos: [] } : {}),
    ...(aprovada ? { resposta_aprovada: undefined, respostas_anteriores: [...(payload.respostas_anteriores ?? []), aprovada] } : {}),
  }
}
