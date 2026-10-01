type FlowMetrics = {
  area: 'gerar' | 'saneamento' | 'monitor' | 'historico' | 'acordos'
  inicio: number
  canal?: string
  filtradoPorCarteira: boolean
  filtradoPorCondominio: boolean
  consultadas: number
  retornadas: number
}

// Opt-in no servidor. Lista fechada de campos: não registra filtros, IDs,
// contatos, URLs ou conteúdo de mensagens mesmo que sejam passados por engano.
export function registrarPerformanceFlow(metrics: FlowMetrics) {
  if (process.env.LOG_FLOW_PERFORMANCE !== 'true') return
  console.info(JSON.stringify({
    event: 'flow_query', area: metrics.area,
    duration_ms: Math.max(0, Date.now() - metrics.inicio),
    canal: ['email', 'whatsapp', 'manual'].includes(metrics.canal ?? '') ? metrics.canal : undefined,
    filtered_by_carteira: metrics.filtradoPorCarteira,
    filtered_by_condominio: metrics.filtradoPorCondominio,
    scanned_rows: metrics.consultadas, returned_rows: metrics.retornadas,
  }))
}
