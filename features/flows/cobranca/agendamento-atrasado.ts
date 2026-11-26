export function agendamentoAtrasado(mensagem: {
  status?: string; status_operacional?: string
  agendada_para?: string | null; scheduled_at?: string | null
  sent_at?: string | null; enviada_em?: string | null
} | null | undefined, agora: number | null): boolean {
  if (!mensagem || agora === null || mensagem.sent_at || mensagem.enviada_em) return false
  if ((mensagem.status ?? mensagem.status_operacional) !== 'agendada') return false
  const horario = Date.parse(mensagem.agendada_para ?? mensagem.scheduled_at ?? '')
  return Number.isFinite(horario) && horario < agora
}
