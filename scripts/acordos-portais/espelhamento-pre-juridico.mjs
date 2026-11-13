const MS_POR_DIA = 86_400_000
const situacoesAbertas = new Set(['em_aberto', 'vencido', 'parcial'])
const situacoesImpedidas = new Set(['acordo_firmado', 'acordo_efetivado', 'acordo_quebrado', 'suspenso', 'judicializado'])
const situacoesEncaminhaveis = new Set(['novo', 'em_cobranca_ativa', 'em_negociacao', 'possivel_acordo'])

export function planejarPreJuridico({ dataBase, condominio, cotas, acordos }) {
  const minimoCotas = condominio.pre_juridico_minimo_cotas ?? 5
  const prazoDias = (condominio.inicio_cobranca_dias ?? 0) + (condominio.dias_cobranca_ativa ?? 60)
  const habilitado = condominio.pre_juridico_habilitado === true && condominio.carteiras?.pre_juridico_habilitado === true
  const acordosJudiciais = new Set(acordos.filter(a => a.tipo === 'judicial').map(a => a.unidade_id))
  const porUnidade = new Map()
  const correspondenciasPorCota = new Map()
  for (const { cota } of cotas) {
    correspondenciasPorCota.set(cota.id, (correspondenciasPorCota.get(cota.id) ?? 0) + 1)
  }

  for (const { item, unidade, cota, vinculoExato, impedida } of cotas) {
    const diasAtraso = (Date.parse(dataBase) - Date.parse(item.vencimento)) / MS_POR_DIA
    if (!(diasAtraso > 0) || impedida || correspondenciasPorCota.get(cota.id) !== 1
      || cota.data_pagamento || !situacoesAbertas.has(cota.status_financeiro)
      || situacoesImpedidas.has(cota.status_operacional)) continue
    if (unidade.acao_judicial || unidade.numero_processo?.trim() || acordosJudiciais.has(unidade.id)
      || ['nosso_escritorio', 'outro_advogado'].includes(unidade.conducao_processo)) continue

    const vencidas = porUnidade.get(unidade.id) ?? new Map()
    vencidas.set(item.recibo, {
      id: cota.id, recibo: item.recibo, unidade: item.unidade, competencia: cota.competencia ?? null,
      vencimento: item.vencimento, diasAtraso, saldoCentavos: item.valores.at(-1),
      vinculoExato, encaminhavel: situacoesEncaminhaveis.has(cota.status_operacional),
    })
    porUnidade.set(unidade.id, vencidas)
  }

  const unidades = []
  for (const [unidadeId, vencidas] of porUnidade) {
    if (vencidas.size < minimoCotas) continue
    const cotasEncaminhaveis = [...vencidas.values()].filter(c => c.encaminhavel && c.diasAtraso >= prazoDias)
    if (!cotasEncaminhaveis.length) continue
    const cotas = cotasEncaminhaveis.map(({ id, recibo, competencia, vencimento, diasAtraso, saldoCentavos, vinculoExato }) =>
      ({ id, recibo, competencia, vencimento, diasAtraso, saldoCentavos, vinculoExato }))
    unidades.push({
      unidadeId,
      unidade: cotasEncaminhaveis[0].unidade,
      totalEmAtraso: vencidas.size,
      comprovacaoMinimo: [...vencidas.values()].filter(c => c.vinculoExato).map(c => ({ id: c.id, recibo: c.recibo, vencimento: c.vencimento })),
      exigeRevisaoVinculo: cotas.some(c => !c.vinculoExato) || [...vencidas.values()].filter(c => c.vinculoExato).length < minimoCotas,
      saldoCentavos: cotas.reduce((soma, c) => soma + c.saldoCentavos, 0),
      cotas,
    })
  }
  unidades.sort((a, b) => a.unidade.localeCompare(b.unidade, 'pt-BR', { numeric: true }))
  return {
    dataBase, habilitado, prazoDias, minimoCotas, unidades,
    quantidadeCotas: unidades.reduce((soma, u) => soma + u.cotas.length, 0),
    saldoCentavos: unidades.reduce((soma, u) => soma + u.saldoCentavos, 0),
  }
}
