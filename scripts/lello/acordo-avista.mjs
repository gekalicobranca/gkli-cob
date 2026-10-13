/** Planejamento supervisionado. Não lança acordos nem envia mensagens. */
export function planejarAcordoAvista({ referencia, unidade, recibos, vencimento, baseCentavos, percentual, acordoExistente, totalPortalCentavos }) {
  if (!/^\d+$/.test(referencia) || !/^\d{6}$/.test(unidade) || !Array.isArray(recibos) || !recibos.length || recibos.some(r => !/^\d+$/.test(r))) throw new Error('Identificação incompleta.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento) || new Date(`${vencimento}T12:00:00Z`).toISOString().slice(0, 10) !== vencimento) throw new Error('Vencimento inválido.')
  if (!Number.isSafeInteger(baseCentavos) || baseCentavos <= 0 || !Number.isFinite(percentual) || percentual < 0 || percentual > 100) throw new Error('Condições inválidas.')
  const despesasCentavos = Math.round(baseCentavos * percentual / 100)
  const totalCentavos = baseCentavos + despesasCentavos
  return { referencia, unidade, recibos: [...new Set(recibos)], vencimento, parcelas: 1, despesasCentavos, totalCentavos,
    acao: acordoExistente ? 'consultar_acordo_existente' : 'preparar_para_revisao', acordoExistente: acordoExistente ?? null,
    divergenciaCentavos: totalPortalCentavos === undefined ? null : totalPortalCentavos - totalCentavos,
    toleranciaCentavos: 50,
    exigeRevisao: totalPortalCentavos !== undefined && Math.abs(totalPortalCentavos - totalCentavos) > 50,
    finalizarAutomaticamente: false, enviarAutomaticamente: false, procedimento: 'docs/keila-lello-acordo-avista.md' }
}
