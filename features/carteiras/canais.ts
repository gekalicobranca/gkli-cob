export type CanalComunicacaoCarteira = 'email' | 'whatsapp'

type CarteiraCanais = {
  email_habilitado?: boolean | null
  whatsapp_habilitado?: boolean | null
}

export function createCarteiraCanalChecker(supabase: any) {
  const cache = new Map<string, CarteiraCanais>()

  return async (carteiraId: string, canal: string | null | undefined) => {
    if (canal !== 'email' && canal !== 'whatsapp') return true

    let configuracao = cache.get(carteiraId)
    if (!configuracao) {
      const { data, error } = await supabase
        .from('carteiras')
        .select('email_habilitado, whatsapp_habilitado')
        .eq('id', carteiraId)
        .maybeSingle()

      if (error) {
        throw new Error(`Erro ao carregar canais da carteira: ${error.message}`)
      }

      configuracao = data ?? {}
      cache.set(carteiraId, configuracao)
    }

    return canal === 'email'
      ? configuracao.email_habilitado !== false
      : configuracao.whatsapp_habilitado === true
  }
}

export function nomeCanalComunicacao(canal: string) {
  return canal === 'email' ? 'E-mail' : canal === 'whatsapp' ? 'WhatsApp' : canal
}
