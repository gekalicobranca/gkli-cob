type Tentativa = { estado?: string; iniciado_em?: string | null; recuperacao?: string | null }
type Mensagem = {
  status?: string; status_operacional?: string; provider_status?: string
  email_tentativas?: Tentativa[]; whatsapp_web_envios?: Tentativa[]
  thunderbird_envios?: { estado?: string }[]
}

// Uma confirmação posterior resolve a incerteza, sem apagar tentativas antigas.
export function envioExigeConferencia(mensagem: Mensagem | null | undefined, agora = Date.now()): boolean {
  if (!mensagem || mensagem.status === 'enviada') return false
  const ultima = (tentativas: Tentativa[] = []) => [...tentativas].sort((a, b) =>
    String(b.iniciado_em ?? '').localeCompare(String(a.iniciado_em ?? '')))[0]
  return mensagem.provider_status === 'incerto'
    || mensagem.status_operacional === 'incerto'
    || ultima(mensagem.email_tentativas)?.estado === 'incerto'
    || (mensagem.email_tentativas ?? []).some(t => t.recuperacao === 'conferencia'
      || (t.estado === 'em_envio' && Date.parse(t.iniciado_em ?? '') < agora - 10 * 60_000))
    || ultima(mensagem.whatsapp_web_envios)?.estado === 'incerto'
    || (mensagem.thunderbird_envios ?? []).some(t => t.estado === 'incerto')
}
