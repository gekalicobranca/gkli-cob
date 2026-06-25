type MensageriaLogInput = {
  carteira_id?: string | null
  lote_id?: string | null
  lote_item_id?: string | null
  mensagem_id?: string | null
  evento: string
  status_anterior?: string | null
  status_novo?: string | null
  descricao?: string | null
  payload?: Record<string, unknown>
}

function isMissingLogStructure(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '42P01' || error.code === '42703' || error.code === 'PGRST204'
}

export async function registrarLogMensageria(supabase: any, input: MensageriaLogInput) {
  const { error } = await supabase.from('mensageria_logs').insert({
    carteira_id: input.carteira_id ?? null,
    lote_id: input.lote_id ?? null,
    lote_item_id: input.lote_item_id ?? null,
    mensagem_id: input.mensagem_id ?? null,
    evento: input.evento,
    status_anterior: input.status_anterior ?? null,
    status_novo: input.status_novo ?? null,
    descricao: input.descricao ?? null,
    payload: input.payload ?? {},
  } as any)

  if (error) {
    if (isMissingLogStructure(error)) {
      console.warn('Tabela de logs de mensageria ainda nao esta disponivel.', {
        code: error.code,
        message: error.message,
      })
      return
    }

    throw new Error(`Erro ao registrar log de mensageria: ${error.message}`)
  }
}
