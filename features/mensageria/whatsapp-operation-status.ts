type Session = { status: string; numero: string | null; atualizado_em: string }
type Control = { habilitado: boolean; reiniciar_id: string | null; aplicado_id: string | null; atualizado_em: string; supervisor_em: string | null; supervisor_status: string | null }
type Monitor = { ultimo_sinal_em: string | null; metadata_json: unknown }
type State = { tone: 'green' | 'amber' | 'red' | 'gray'; title: string; detail: string; next: string }

export function whatsappOperationStatus({ session, control, monitor, expectedPhone, channelEnabled = true, now = Date.now() }: {
  session?: Session; control?: Control; monitor?: Monitor; expectedPhone: string | null; channelEnabled?: boolean; now?: number
}) {
  const fresh = (date?: string | null) => {
    const age = date ? now - Date.parse(date) : Infinity
    return Number.isFinite(age) && age >= -30000 && age < 120000
  }
  const supervisorOnline = fresh(control?.supervisor_em)
  const pending = Boolean(control?.reiniciar_id && control.reiniciar_id !== control.aplicado_id)
  const age = control ? Math.max(0, now - Date.parse(control.atualizado_em)) : 0
  const duration = Number.isFinite(age) ? age < 60000 ? 'há menos de 1 minuto' : `há ${Math.floor(age / 60000)} min` : 'em horário desconhecido'
  const command = pending
    ? `${control?.habilitado ? 'Pedido de conexão' : 'Pedido de pausa'} registrado ${duration}. ${!supervisorOnline ? 'O supervisor está sem sinal recente; a execução ainda não foi confirmada.' : age >= 60000 ? 'A aplicação está demorando mais que o esperado. O supervisor ainda não confirmou a execução.' : 'Aguardando o supervisor executar. O estado abaixo é o último informado pelo worker.'}`
    : null
  const result = (state: State) => ({ ...state, supervisorOnline, pending, command })
  if (!channelEnabled) return result({ tone: 'amber', title: 'WhatsApp desabilitado na carteira', detail: 'O canal WhatsApp está desabilitado no cadastro desta carteira. A autorização do worker é uma configuração separada e não habilita o canal.', next: 'Um administrador deve revisar a opção WhatsApp no cadastro da carteira. Reconectar a sessão não altera essa opção.' })
  if (pending) return result({ tone: 'amber', title: control?.habilitado ? 'Conexão solicitada' : 'Pausa solicitada', detail: 'O pedido foi salvo, mas ainda não foi aplicado. Isso não confirma uma nova conexão nem uma pausa concluída.', next: supervisorOnline ? 'Acompanhe a atualização automática. Se a espera persistir, verifique o processo supervisor no computador dos workers.' : 'Verifique se o computador dos workers está ligado, com internet e com o supervisor em execução.' })
  if (control?.habilitado === false) return result({ tone: 'gray', title: supervisorOnline && control.supervisor_status === 'pausado' ? 'Pausado' : 'Pausa configurada · sem confirmação atual', detail: 'Os envios estão desabilitados na configuração.', next: 'Use Retomar envios para solicitar a conexão e voltar a processar os Flows.' })
  if (!fresh(session?.atualizado_em)) return result({ tone: 'red', title: 'Sem resposta · funcionamento não confirmado', detail: 'O worker não informou um estado válido nos últimos 2 minutos. A conexão pode ter caído ou o computador pode estar sem comunicação.', next: supervisorOnline ? 'A recuperação automática está ativa. Se o sinal não voltar, verifique os logs do worker no computador.' : 'Verifique o computador dos workers, a internet e o supervisor.' })
  const status = session?.status
  if (status === 'numero_incorreto' || (status === 'conectado' && session?.numero !== expectedPhone)) return result({ tone: 'red', title: 'Bloqueado · número diferente', detail: 'O WhatsApp conectado não corresponde ao número esperado para esta carteira.', next: 'Confira o número configurado e conecte a conta correta pelo painel de QR Codes.' })
  if (status === 'aguardando_qr' || status === 'falha_autenticacao') return result({ tone: 'amber', title: 'Ação necessária · vincular WhatsApp', detail: 'O WhatsApp ainda não está autenticado para enviar por esta sessão.', next: 'Abra o painel de conexão no computador dos workers e vincule a conta pelo celular usando QR Code ou código de vinculação.' })
  if (status === 'iniciando' || status === 'conferencia_necessaria') return result({ tone: 'amber', title: 'Conectando · ainda não está pronto', detail: status === 'conferencia_necessaria' ? 'O worker informou um envio sem confirmação e está sendo recuperado. Essa mensagem permanece pendente para conferência.' : 'O worker informou que está abrindo ou sincronizando o WhatsApp.', next: supervisorOnline ? 'Aguarde a conexão. Se continuar assim, verifique os logs e o painel de QR Codes.' : 'A recuperação automática está sem sinal recente. Verifique o supervisor no computador dos workers.' })
  if (status === 'conectado') {
    const metadata = monitor?.metadata_json as { estado?: string } | null
    if (fresh(monitor?.ultimo_sinal_em) && metadata?.estado === 'operando' && control?.habilitado) return result({ tone: 'green', title: 'Pronto para enviar', detail: 'WhatsApp conectado ao número esperado, processamento ativo e envios autorizados. As mensagens seguem os Flows, horários e limites configurados.', next: supervisorOnline ? 'Nenhuma ação necessária. Estar pronto não significa que uma mensagem já foi entregue.' : 'Os envios estão prontos, mas a recuperação automática está sem sinal recente. Verifique o supervisor.' })
    return result({ tone: 'amber', title: 'Conectado · processamento não confirmado', detail: fresh(monitor?.ultimo_sinal_em) && metadata?.estado === 'conexao' ? 'O WhatsApp está conectado em modo de conexão, sem processar envios.' : 'A conexão está confirmada, mas falta confirmação atual de que o worker está processando os Flows com envios autorizados.', next: 'Use Reconectar WhatsApp para solicitar um worker de envios e acompanhe o estado.' })
  }
  return result({ tone: 'red', title: 'Indisponível para enviar', detail: `Último estado do worker: ${status === 'erro' ? 'falha de conexão' : status === 'parado' ? 'parado' : status === 'desconectado' ? 'desconectado' : 'não reconhecido'}.`, next: supervisorOnline ? 'A recuperação automática está ativa. Acompanhe a reconexão; se persistir, verifique os logs.' : 'Verifique o supervisor no computador dos workers para recuperar a conexão.' })
}
