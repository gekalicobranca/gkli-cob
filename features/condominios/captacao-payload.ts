export function captacaoPayload(formData: FormData, aba: string) {
  if (aba && aba !== 'cobranca') return {}
  const habilitada = formData.get('captacao_automatica_habilitada') === 'on'
  const raw = String(formData.get('captacao_dia_mes') ?? '').trim()
  const dia = raw ? Number(raw) : null
  if (habilitada && (dia === null || !Number.isInteger(dia) || dia < 1 || dia > 28)) {
    throw new Error('Informe um dia mensal entre 1 e 28 para a captação automática na aba Cobrança.')
  }
  return {
    captacao_automatica_habilitada: habilitada,
    captacao_dia_mes: dia !== null && Number.isInteger(dia) && dia >= 1 && dia <= 28 ? dia : null,
    captacao_horario: String(formData.get('captacao_horario') ?? '').trim() || '08:00',
  }
}
