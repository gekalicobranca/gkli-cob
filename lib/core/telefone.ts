const DDDS_BR = new Set(
  '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '),
)

export type MotivoTelefone = 'valido' | 'vazio' | 'multiplos_contatos' | 'sem_ddd' | 'formato_invalido'
export type TelefoneNormalizado = {
  original: string
  numero: string | null
  motivo: MotivoTelefone
  candidatos: string[]
}

function nacionalValido(digits: string) {
  return DDDS_BR.has(digits.slice(0, 2)) && (
    /^\d{2}[2-5]\d{7}$/.test(digits) || /^\d{2}9\d{8}$/.test(digits)
  )
}

function normalizarUnico(original: string): TelefoneNormalizado {
  const invalid = { original, numero: null, motivo: 'formato_invalido' as const, candidatos: [] }
  // Letras (incluindo ramais e notação científica) não são descartadas: isso inventaria dígitos.
  if (!/^(?:\+\s*)?[\d\s().-]+$/.test(original)) return invalid
  if (/^\d+\.\d+$/.test(original) && !/^\d{4,9}\.\d{4}$/.test(original)) return invalid
  const digits = original.replace(/\D/g, '')
  if (original.startsWith('+') && !(digits.startsWith('55') && nacionalValido(digits.slice(2)))) return invalid
  let numero: string | null = null
  // Comprimento diferencia o DDD 55 do código de país 55.
  if (nacionalValido(digits)) numero = `55${digits}`
  else if (digits.startsWith('55') && nacionalValido(digits.slice(2))) numero = digits
  else if (digits.startsWith('0') && nacionalValido(digits.slice(1))) numero = `55${digits.slice(1)}`
  else if (digits.startsWith('0055') && nacionalValido(digits.slice(4))) numero = digits.slice(2)
  if (numero) return { original, numero, motivo: 'valido', candidatos: [numero] }
  return { ...invalid, motivo: digits.length === 8 || digits.length === 9 ? 'sem_ddd' : 'formato_invalido' }
}

export function normalizarTelefone(value: unknown): TelefoneNormalizado {
  const original = String(value ?? '').trim()
  if (!original) return { original, numero: null, motivo: 'vazio', candidatos: [] }
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    return { original, numero: null, motivo: 'formato_invalido', candidatos: [] }
  }
  const partes = original.split(/[|;/,\r\n]+/).map(part => part.trim()).filter(Boolean)
  if (partes.length > 1) {
    const results = partes.map(normalizarUnico)
    const candidatos = [...new Set(results.flatMap(result => result.candidatos))]
    // Só resolve uma lista quando TODOS os itens representam o mesmo número.
    if (candidatos.length === 1 && results.every(result => result.numero === candidatos[0])) {
      return { original, numero: candidatos[0], motivo: 'valido', candidatos }
    }
    return { original, numero: null, motivo: 'multiplos_contatos', candidatos }
  }
  return normalizarUnico(original)
}

export function primeiroTelefoneValido(...values: unknown[]) {
  for (const value of values) {
    const numero = normalizarTelefone(value).numero
    if (numero) return numero
  }
  return null
}

export type ContatosClassificados = {
  celular: string | null
  telefone_fixo: string | null
  telefone_outros: string | null
  telefone: string | null
}

// Classifica cada contato separadamente, sem unir dígitos de números diferentes.
export function classificarContatos(...values: unknown[]): ContatosClassificados {
  const celulares = new Set<string>()
  const fixos = new Set<string>()
  const outros = new Set<string>()
  for (const value of values) {
    for (const raw of String(value ?? '').split(/[|;/,\r\n]+/).map(part => part.trim()).filter(Boolean)) {
      const numero = normalizarTelefone(raw).numero
      if (!numero) outros.add(raw)
      else if (numero.length === 13) celulares.add(numero)
      else fixos.add(numero)
    }
  }
  return {
    celular: [...celulares].join(' | ') || null,
    telefone_fixo: [...fixos].join(' | ') || null,
    telefone_outros: [...outros].join(' | ') || null,
    telefone: [...celulares][0] ?? [...fixos][0] ?? null,
  }
}
