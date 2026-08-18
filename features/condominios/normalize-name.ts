export function normalizeCondominioName(value: string) {
  return value
    .replace(/condominio/gi, (word) => {
      if (word === word.toUpperCase()) return 'CONDOMÍNIO'
      if (word[0] === word[0]?.toUpperCase()) return 'Condomínio'
      return 'condomínio'
    })
    .replace(/edificio/gi, (word) => {
      if (word === word.toUpperCase()) return 'EDIFÍCIO'
      if (word[0] === word[0]?.toUpperCase()) return 'Edifício'
      return 'edifício'
    })
    .toLocaleUpperCase('pt-BR')
}
