export function responsavelWhatsappSemEmail(contato: { destinatario?: unknown; email?: unknown }) {
  return Boolean(String(contato.destinatario ?? '').trim()) && !String(contato.email ?? '').trim()
}

// Partição estável: mantém a ordem de vencimento dentro de cada prioridade.
export function priorizarWhatsappSemEmail<T extends { whatsapp_sem_email?: boolean }>(rows: T[], canal?: string) {
  return canal === 'whatsapp'
    ? [...rows].sort((a, b) => Number(Boolean(b.whatsapp_sem_email)) - Number(Boolean(a.whatsapp_sem_email)))
    : rows
}
