export function normalizeCondominioName(value: string) {
  return value.replace(/condominio/gi, (word) => {
    if (word === word.toUpperCase()) return 'CONDOMÍNIO'
    if (word[0] === word[0]?.toUpperCase()) return 'Condomínio'
    return 'condomínio'
  })
}
