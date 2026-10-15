export function somenteExecucoesLiberadas(query, agora = new Date(), captacaoAtiva = true) {
  if (process.env.AGENTE_EXECUCAO_ID) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(process.env.AGENTE_EXECUCAO_ID)) throw new Error('Execução manual inválida.')
    // O executor manual continua restrito ao pedido aberto pelo operador.
    if (process.env.AGENTE_SUPERVISIONADO !== 'true') return query.eq('id', process.env.AGENTE_EXECUCAO_ID).is('agendado_para', null).in('origem', ['maestro', 'manual'])
    query = query.eq('id', process.env.AGENTE_EXECUCAO_ID)
  }
  const liberadas = query.or(`agendado_para.is.null,agendado_para.lte.${agora.toISOString()}`)
  // Pedidos manuais continuam disponíveis durante a pausa do Maestro.
  return captacaoAtiva
    ? liberadas
    : liberadas.or('origem.eq.manual,origem.eq.manual_agendada,origem.eq.manual_administradora,origem.like.manual_worker:*' + (process.env.AGENTE_SUPERVISIONADO === 'true' ? ',and(origem.eq.maestro,agendado_para.is.null)' : ''))
}
