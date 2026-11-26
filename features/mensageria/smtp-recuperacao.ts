export type RecuperacaoSmtp = 'repetir' | 'permanente' | 'conferencia'

export class ResultadoSmtpRegistradoError extends Error {
  constructor(message: string) { super(message); this.name = 'ResultadoSmtpRegistradoError' }
}

export function classificarFalhaSmtp(error: unknown, dadosTransmitidos: boolean): RecuperacaoSmtp {
  const e = error as { smtpCode?: number; code?: string; message?: string }
  // Uma recusa explícita comprova que a mensagem não foi aceita, inclusive após DATA.
  if (e?.smtpCode && e.smtpCode >= 400 && e.smtpCode < 600) return e.smtpCode < 500 ? 'repetir' : 'permanente'
  if (dadosTransmitidos) return 'conferencia'
  const transitoria = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE'].includes(e?.code ?? '')
    || ['Tempo excedido na conexão SMTP.', 'Tempo excedido aguardando confirmação SMTP.', 'Conexão SMTP encerrada sem confirmação.'].includes(e?.message ?? '')
  return transitoria ? 'repetir' : 'permanente'
}
