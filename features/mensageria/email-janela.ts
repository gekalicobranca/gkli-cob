/** Janela global dos flows de e-mail: 22:00 inclusiva até 06:00 exclusiva. */
export function emailHorarioPermitido(agora = new Date()) {
  const hora = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23',
  }).format(agora))
  return hora >= 22 || hora < 6
}
