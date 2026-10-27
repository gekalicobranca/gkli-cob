// Cede a vez à coleta operacional já iniciada. Não altera filas ou agendas.
export async function portalOcupado(db) {
 // Estados abandonados há dias não representam um navegador ativo.
 // O limite é muito maior que o orçamento de execução dos coletores.
 const inicioRecente=new Date(Date.now()-6*60*60_000).toISOString()
 const resultados = await Promise.all([
   db.from('agente_execucoes').select('id').eq('status','em_execucao').gte('iniciado_em',inicioRecente).limit(1),
   db.from('agente_acordos_execucoes').select('id').eq('status','em_execucao').limit(1),
 ])
 if (resultados.some(r => r.error)) throw Error('Não foi possível conferir a carga dos coletores dos portais.')
 return resultados.some(r => r.data?.length)
}
