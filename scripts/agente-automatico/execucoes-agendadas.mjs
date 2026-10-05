export function somenteExecucoesLiberadas(query, agora = new Date(), captacaoAtiva = true) {
  const liberadas = query.or(`agendado_para.is.null,agendado_para.lte.${agora.toISOString()}`)
  // Pedidos manuais continuam disponíveis durante a pausa do Maestro.
  return captacaoAtiva
    ? liberadas
    : liberadas.or('origem.eq.manual,origem.eq.manual_agendada,origem.eq.manual_administradora,origem.like.manual_worker:*')
}
