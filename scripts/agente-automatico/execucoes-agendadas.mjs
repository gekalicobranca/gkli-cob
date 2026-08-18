export function somenteExecucoesLiberadas(query, agora = new Date()) {
  return query.or(`agendado_para.is.null,agendado_para.lte.${agora.toISOString()}`)
}
