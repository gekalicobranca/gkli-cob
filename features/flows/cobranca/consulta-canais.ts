// Limita o retorno a uma mensagem por canal: a lista precisa saber quais canais
// existem, sem transferir todas as mensagens de cada Flow para o servidor Next.
export const FLOW_CANAIS_SELECT = `
  canal_email:mensagens!mensagens_cobranca_flow_id_fkey(canal),
  canal_whatsapp:mensagens!mensagens_cobranca_flow_id_fkey(canal),
  canal_manual:mensagens!mensagens_cobranca_flow_id_fkey(canal)
`

export function aplicarCanalNaConsultaFlows(query: any, canal?: string) {
  for (const value of ['email', 'whatsapp', 'manual']) {
    query = query.eq(`canal_${value}.canal`, value)
      .limit(1, { referencedTable: `canal_${value}` })
  }
  if (!canal) return query
  if (!['email', 'whatsapp', 'manual'].includes(canal)) throw new Error('Canal de Flow inválido.')
  // A régua e as mensagens também identificam Flows legados sem payload.canais.
  // O filtro é aplicado antes da paginação, preservando Flows mistos em ambas as áreas.
  return query.eq('regua_canal.etapas.canal', canal)
    .or(`payload->canais.cs.["${canal}"],canal_${canal}.not.is.null,regua_canal.not.is.null`)
}

export function canaisDasMensagensFlow(flow: Record<string, any>): string[] {
  return ['email', 'whatsapp', 'manual'].filter(canal => flow[`canal_${canal}`]?.length > 0)
}
