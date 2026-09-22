type FonteRecibo = { recibo?: string | null; referencia?: string | null; observacoes?: string | null }

/** Conserva o identificador completo; separa apenas marcadores conhecidos da origem. */
export function identidadeRecibo(fonte: FonteRecibo): { recibo: string; marcador: string | null } | null {
  for (const campo of [fonte.recibo, fonte.referencia]) {
    if (!campo?.trim()) continue
    const parsed = interpretar(campo.trim().replace(/^recibo(?:\s*:\s*|\s+)/i, ''))
    if (parsed) return parsed
  }
  const match = fonte.observacoes?.match(/\brecibo(?:\s*:\s*|\s+)((?:(?:AE|AJ|J|A|D|B|P)\s+)?[a-z0-9][a-z0-9._/-]*)(?=\s|\||$)/i)
  return match ? interpretar(match[1]) : null
}

/** Persiste o recibo explícito também onde os importadores legados o armazenam. */
export function observacoesComRecibo(fonte: FonteRecibo): string | null {
  const identidade = identidadeRecibo(fonte)
  const observacao = fonte.observacoes?.trim() || null
  if (!identidade) return observacao
  const naObservacao = identidadeRecibo({ observacoes: observacao })
  if (naObservacao && (naObservacao.recibo !== identidade.recibo || naObservacao.marcador !== identidade.marcador)) {
    throw new Error('Recibo explícito diverge do recibo nas observações. Revise a origem.')
  }
  if (naObservacao) return observacao
  return [`Recibo ${[identidade.marcador, identidade.recibo].filter(Boolean).join(' ')}`, observacao].filter(Boolean).join(' | ')
}

function interpretar(value: string) {
  const match = value.toUpperCase().match(/^(?:(AE|AJ|J|A|D|B|P)\s+)?([A-Z0-9][A-Z0-9._/-]*)$/)
  if (!match || !/\d/.test(match[2])) return null
  return { recibo: match[2], marcador: match[1] ?? null }
}

export function competenciaNormalizada(value?: string | null) {
  const text = value?.trim() ?? ''
  const br = text.match(/^(0?[1-9]|1[0-2])\/(\d{4})$/)
  if (br) return `${br[2]}-${br[1].padStart(2, '0')}`
  const iso = text.match(/^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/)
  return iso ? `${iso[1]}-${iso[2]}` : text.toLowerCase()
}
