/** Política para novas propostas; versões históricas continuam imutáveis. */
export const REGRA_VALIDADE_PROPOSTA = 'sete_dias_v1' as const
export const AVISO_VALIDADE_PROPOSTA = 'Esta proposta tem validade de 7 dias a partir do envio deste e-mail. Se o vencimento à vista ou da primeira parcela passar antes disso, solicite uma nova proposta com valores atualizados. A renovação depende de nova confirmação das condições.'

export function diaBrasilia(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora)
}

export function fimPeriodoProposta(agora = new Date()) {
  const [ano, mes, dia] = diaBrasilia(agora).split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1 + (dia > 10 ? 1 : 0), 10)).toISOString().slice(0, 10)
}

export function validarVencimentoProposta(vencimento: string, agora = new Date()) {
  const data = new Date(`${vencimento}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento) || !Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== vencimento) throw new Error('Vencimento inválido.')
  if (vencimento < diaBrasilia(agora) || vencimento > fimPeriodoProposta(agora)) throw new Error(`O vencimento à vista ou da primeira parcela deve estar entre hoje e ${fimPeriodoProposta(agora).split('-').reverse().join('/')} (período de 11 a 10).`)
}

export function validadeProposta(enviadaEm: string) {
  const envio = new Date(enviadaEm)
  if (!Number.isFinite(envio.getTime())) throw new Error('Envio confirmado inválido.')
  return new Date(envio.getTime() + 7 * 86400000)
}

export function situacaoValidadeProposta(enviadaEm: string, vencimento: string, agora = new Date()) {
  const validade = validadeProposta(enviadaEm)
  return { validade, expirada: agora >= validade, vencimentoPassou: vencimento < diaBrasilia(agora),
    lembrarHoje: diaBrasilia(agora) === diaBrasilia(new Date(validade.getTime() - 86400000)) && agora < validade && vencimento >= diaBrasilia(agora) }
}
