export function acordoHomologadoVigente(acordo) {
  return acordo.acordo_homologado === true && ['ativo', 'em_dia', 'em_atraso'].includes(acordo.status)
}

export function auditarAcordosHomologados(app, verificar) {
  const unidades = new Map(app.unidades.map(u => [u.id, u]))
  return app.acordos.filter(acordoHomologadoVigente).map(acordo => {
    const unidade = unidades.get(acordo.unidade_id)
    const cotas = new Set([acordo.cobranca_id, ...acordo.acordo_cobrancas.map(c => c.cobranca_id)].filter(Boolean))
    return {
      acordoId: acordo.id,
      unidade: unidade?.identificacao ?? null,
      bloco: unidade?.bloco ?? null,
      numero: acordo.acordos_fontes_lello?.numero_acordo ?? null,
      cotasProtegidas: cotas.size,
      ...verificar(acordo),
    }
  })
}

export function situacaoAcordoLello({ emAndamento, historicoConferido, ficha, recibosNoHistorico }) {
  const situacao = ficha?.situacao?.trim().toUpperCase()
  if (situacao === 'EM ANDAMENTO') {
    return emAndamento ? { estado: 'encontrado' }
      : { estado: 'inconclusivo', motivo: 'A ficha confirma o acordo em andamento, mas ele ficou fora da lista ativa.' }
  }
  if (['QUITADO', 'CANCELADO', 'RENEGOCIADO', 'ROMPIDO', 'QUEBRADO'].includes(situacao)) {
    return { estado: 'historico', motivo: ficha.situacao }
  }
  if (situacao) return { estado: 'inconclusivo', motivo: 'Situação a confirmar no portal: ' + ficha.situacao + '.' }
  if (historicoConferido && ficha?.naoEncontrado && !recibosNoHistorico) {
    return { estado: 'critico', motivo: 'Ausente da lista ativa e do histórico da unidade. A consulta direta pelo número também confirmou a ausência.' }
  }
  return { estado: 'inconclusivo', motivo: recibosNoHistorico
    ? 'Há recibos do acordo no histórico. A situação atual ainda precisa ser confirmada.'
    : 'A busca no histórico e pelo número do acordo não confirmou a situação.' }
}

export function situacaoAcordoDemonstrativo(linhas, disponivel, manager) {
  if (linhas?.length === 1) {
    const [linha] = linhas
    const numero = linha.processo
    if (linha.total.saldo_centavos > 0) return { estado: 'encontrado', numero }
    if (linha.total.valor_centavos > 0 && linha.total.saldo_centavos === 0 &&
        linha.total.recebido_centavos === linha.total.valor_centavos) {
      return { estado: 'historico', numero, motivo: 'Pagamento integral no demonstrativo.' }
    }
  }
  const motivo = linhas?.length > 1 ? 'Mais de um acordo compatível no demonstrativo.'
    : !disponivel ? 'Demonstrativo de acordos indisponível.'
      : manager ? 'A Manager retornou apenas os acordos em aberto. Falta consultar o histórico.'
        : 'O demonstrativo consultado não confirma a situação deste acordo no histórico.'
  return { estado: 'inconclusivo', motivo }
}
