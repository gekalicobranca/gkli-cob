export type FormalizacaoEvento = {
  id: string; evento: string; evidencia: string; origem: string; referencia: string
  ocorrido_em: string; usuario_id?: string | null; profiles?: { nome?: string } | null
}

/** A geração de um documento ou um timestamp legado não comprova envio. */
export function formalizacaoState(acordo: any) {
  const eventos: FormalizacaoEvento[] = acordo.formalizacao_eventos ?? []
  const tem = (evento: string) => eventos.some(e => e.evento === evento)
  const termos: any[] = acordo.termos ?? []
  const mensagens: any[] = acordo.mensagens_formalizacao ?? []
  const termosDevedor = termos.filter(t => t.tipo_aceite !== 'sindico')
  const refsDevedor = new Set(termosDevedor.map(t=>t.id))
  const mensagensDevedor = mensagens.filter(m=>refsDevedor.has(m.payload?.termo_id))
  for (const m of mensagensDevedor) refsDevedor.add(m.id)
  const temDevedor = (evento: string) => eventos.some(e => e.evento === evento && refsDevedor.has(e.referencia))
  const preparado = tem('solicitacao_preparada') || mensagens.some(m => m.origem_evento === 'acordo_boletos_administradora')
  const enviado = tem('solicitacao_enviada')
  const recebido = tem('boletos_recebidos')
  const boletosEnviados = tem('boletos_enviados')
  const encerrado = ['cancelado','quebrado','renegociado','quitado'].includes(acordo.status)
  const bloqueado = encerrado || Boolean(acordo.exige_aprovacao_sindico && !acordo.sindico_aprovado_em)
  const termoAceito = temDevedor('termo_aceito') || termosDevedor.some(t => t.status === 'aceito' && t.aceito_em)
  return {
    eventos, preparado, enviado, recebido, boletosEnviados,
    podeConfirmarSolicitacao: preparado && !enviado && !bloqueado,
    podeConfirmarRecebimento: enviado && !recebido && !bloqueado,
    podeConfirmarEnvio: recebido && !boletosEnviados && !bloqueado,
    documento: termoAceito ? 'Aceite registrado' : temDevedor('termo_visualizado') || termosDevedor.some(t=>t.visualizado_em) ? 'Visualização registrada' : termosDevedor.length ? 'Termo gerado' : 'Termo do devedor não gerado',
    comunicacao: temDevedor('termo_entregue') ? 'Entrega confirmada' : temDevedor('termo_enviado') ? 'Envio confirmado' : temDevedor('termo_liberado') ? 'Liberada para envio' : temDevedor('termo_rascunho') || mensagensDevedor.length ? 'Mensagem em rascunho' : 'Sem envio comprovado',
    solicitacao: tem('solicitacao_entregue') ? 'Entrega confirmada' : enviado ? 'Solicitação enviada' : tem('solicitacao_liberada') ? 'Liberada para envio' : preparado ? 'Solicitação preparada, ainda não enviada' : 'Solicitação não preparada',
    boletos: boletosEnviados ? 'Enviados ao devedor' : recebido ? 'Recebimento confirmado' : 'Recebimento não confirmado',
    legadoSemEvidencia: !enviado && Boolean(acordo.boletos_solicitados_em || ['boletos_solicitados','boletos_recebidos','boletos_enviados'].includes(acordo.fluxo_status)),
  }
}
