export type ResultadoAtivacaoFlow = { ok: true; aviso?: string } | { ok: false; error: string }

export const ERRO_ATIVACAO_INCERTA = 'Não foi possível confirmar a ativação. Atualize a lista para conferir o status antes de tentar novamente.'

/** Mensagens conhecidas, sem devolver detalhes de transporte, credenciais ou SQL ao navegador. */
export function erroAtivacaoFlow(mensagem: string): ResultadoAtivacaoFlow {
  if (mensagem.includes('Rota SMTP inativa ou fora da carteira')) {
    return { ok: false, error: 'A rota SMTP deste condomínio está inativa ou vinculada a outra carteira. Corrija a configuração de e-mail antes de ativar o Flow.' }
  }
  if (/Conta SMTP|SMTP.*indisponível|remetente.*configurad/i.test(mensagem)) {
    return { ok: false, error: 'A conta SMTP ou o remetente deste Flow está indisponível. Confira a configuração de e-mail da carteira e do condomínio.' }
  }
  return { ok: false, error: 'Não foi possível ativar o Flow. Confira o status e as configurações de envio antes de tentar novamente.' }
}
