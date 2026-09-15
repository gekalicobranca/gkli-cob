type Execucao = { status: string; created_at: string; iniciado_em?: string | null; finalizado_em?: string | null; erro_mensagem?: string | null }
type Conversao = { status: string; criado_em: string; atualizado_em?: string | null }

export function resumirMonitor(execucao: Execucao, arquivo: unknown, conversao: Conversao | null, ultimoSinal: string | null, now = Date.now()) {
  const online = Boolean(ultimoSinal && now - Date.parse(ultimoSinal) < 90_000)
  const terminal = ['falha', 'cancelada'].includes(execucao.status)
  if (terminal || execucao.status === 'precisa_intervencao') return { state: 'error', terminal, detail: execucao.erro_mensagem || 'A execução requer intervenção.', online }
  if (['concluido', 'concluido_com_alertas'].includes(conversao?.status ?? '')) return { state: 'completed', terminal: true, detail: conversao?.status === 'concluido_com_alertas' ? 'Importação concluída com alertas. Consulte a validação.' : 'Importação concluída.', online }
  if (conversao?.status === 'aguardando_validacao') return { state: 'attention', terminal: false, detail: 'Conversão pronta; aguardando validação ou importação.', online }
  if (['erro', 'falha', 'cancelado'].includes(conversao?.status ?? '')) return { state: 'error', terminal: true, detail: 'A conversão não foi concluída. Consulte a validação do relatório.', online }
  if (execucao.status === 'pendente' || execucao.status === 'em_execucao') {
    return { state: online ? 'running' : 'attention', terminal: false, online, detail: !online
      ? 'Agente sem sinal recente. Verifique se o agente remoto está ligado; a execução ainda não foi concluída.'
      : execucao.status === 'pendente' ? 'Na fila, aguardando o agente assumir a execução.' : 'Agente executando a coleta. Acompanhe os registros abaixo.' }
  }
  const referencia = conversao?.atualizado_em || conversao?.criado_em || execucao.finalizado_em || execucao.created_at
  const parado = now - Date.parse(referencia) >= 300_000
  return { state: parado ? 'attention' : 'running', terminal: false, online, detail: conversao
    ? parado ? 'Conversão sem avanço há pelo menos 5 minutos.' : 'Convertendo o arquivo e preparando a importação.'
    : arquivo ? parado ? 'Arquivo coletado; a conversão ainda não iniciou após 5 minutos.' : 'Arquivo coletado; aguardando conversão.'
    : 'Coleta encerrada sem arquivo disponível. Verifique os registros.' }
}
