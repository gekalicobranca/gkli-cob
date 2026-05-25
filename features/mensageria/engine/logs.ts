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

export async function registrarLogMensageria(supabase: any, input: MensageriaLogInput) {
  await supabase.from('mensageria_logs').insert({
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
}
