import { dataCivilSaoPaulo, vencimentoMensal } from '../../../lib/core/data-civil'

export function cicloFechamentoCobranca(dia: number | null, instante = new Date()) {
  const hoje = dataCivilSaoPaulo(instante)
  if (dia == null || !Number.isInteger(dia) || dia < 1 || dia > 31) return null
  const mes = `${hoje.slice(0, 7)}-01`
  const fechamento = (meses: number) => {
    const inicio = vencimentoMensal(mes, meses)
    const ultimoDia = new Date(`${vencimentoMensal(inicio, 1)}T00:00:00Z`)
    ultimoDia.setUTCDate(0)
    return `${inicio.slice(0, 7)}-${String(Math.min(dia, ultimoDia.getUTCDate())).padStart(2, '0')}`
  }
  const atual = fechamento(0)
  return hoje <= atual ? atual : fechamento(1)
}
