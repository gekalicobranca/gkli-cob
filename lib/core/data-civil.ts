/** Dates used in contracts are calendar dates, never instants in the host timezone. */
function diasNoMes(ano: number, mes: number) {
  if (mes === 2) return ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0) ? 29 : 28
  return [4, 6, 9, 11].includes(mes) ? 30 : 31
}

export function dataCivilValida(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [ano, mes, dia] = value.split('-').map(Number)
  return ano >= 1 && ano <= 9999 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasNoMes(ano, mes)
}

export function validarDataCivil(value: string, campo = 'Data') {
  if (!dataCivilValida(value)) throw new Error(`${campo} inválido: informe uma data existente em YYYY-MM-DD.`)
  return value
}

/** Always calculate from the original day: Jan 31 -> Feb 28 -> Mar 31. */
export function vencimentoMensal(inicio: string, meses: number) {
  validarDataCivil(inicio, 'Vencimento')
  if (!Number.isSafeInteger(meses)) throw new Error('Intervalo mensal inválido.')
  const [ano, mes, dia] = inicio.split('-').map(Number)
  const indice = ano * 12 + mes - 1 + meses
  const destinoAno = Math.floor(indice / 12)
  const destinoMes = ((indice % 12) + 12) % 12 + 1
  if (destinoAno < 1 || destinoAno > 9999) throw new Error('Vencimento fora do intervalo permitido.')
  return `${String(destinoAno).padStart(4, '0')}-${String(destinoMes).padStart(2, '0')}-${String(Math.min(dia, diasNoMes(destinoAno, destinoMes))).padStart(2, '0')}`
}

export function dataCivilSaoPaulo(instante = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instante)
  const get = (tipo: string) => partes.find(p => p.type === tipo)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function somarDiasCivis(inicio: string, dias: number) {
  validarDataCivil(inicio)
  if (!Number.isSafeInteger(dias)) throw new Error('Intervalo diário inválido.')
  const data = new Date(`${inicio}T12:00:00Z`)
  data.setUTCDate(data.getUTCDate() + dias)
  return validarDataCivil(data.toISOString().slice(0, 10))
}

export function diasEntreDatasCivis(inicio: string, fim: string) {
  validarDataCivil(inicio); validarDataCivil(fim)
  return Math.round((Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86400000)
}
