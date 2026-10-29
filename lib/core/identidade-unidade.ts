export type IdentidadeUnidade = { identificacao?: unknown; unidade?: unknown; bloco?: unknown; condominio_id?: unknown }
const texto = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase()
const token = (v: unknown) => texto(v).replace(/[^A-Z0-9]/g, '').replace(/\d+/g, n => n.replace(/^0+(?=\d)/, ''))
const AIRPORT_ID = '3d99c59b-5e23-497a-837d-ce5dc152708a'
/** Prefixos H/S fazem parte da unidade apenas neste condomínio. */
export function padronizarUnidadeAirport(v: IdentidadeUnidade) {
  if (v.condominio_id !== AIRPORT_ID) return v
  const unidade = token(v.identificacao ?? v.unidade)
  const rawBloco = texto(v.bloco).replace(/^(?:TORRE|BLOCO|BL|EDIFICIO)\s+/, '')
  const prefixoBloco = /^(?:H|HOTEL)$/.test(rawBloco) ? 'H' : /^(?:S|SUITE|SUITES)$/.test(rawBloco) ? 'S' : ''
  const prefixoUnidade = unidade.match(/^([HS])\d{1,4}$/)?.[1]
  const semBloco = !rawBloco || /^(?:0+|SEM\s*BLOCO|N\/?A)$/.test(rawBloco)
  if ((!semBloco && !prefixoBloco) || (prefixoUnidade && prefixoBloco && prefixoUnidade !== prefixoBloco)) throw new Error('Prefixo e bloco incompatíveis no Airport.')
  const prefixo = prefixoUnidade || prefixoBloco
  const numero = prefixoUnidade ? unidade.slice(1) : unidade
  if (!prefixo || !/^\d{1,4}$/.test(numero)) throw new Error('Informe H/HOTEL ou S/SUITES para a unidade do Airport.')
  return { ...v, identificacao: prefixo + numero.padStart(4, '0'), bloco: null }
}
export function blocoComparavel(v: unknown) {
  const raw = texto(v)
  if (!raw || /^(?:0+|SEM\s*BLOCO|N\/?A)$/.test(raw)) return ''
  if (/^(?:GARAGEM|GARAGENS|VG)$/.test(raw)) return 'VG'
  return token(raw.replace(/^(?:TORRE|BLOCO|BL|EDIFICIO)\s+/, ''))
}
export function identidade(v: IdentidadeUnidade) {
  v = padronizarUnidadeAirport(v)
  const unidade = token(v.identificacao ?? v.unidade)
  const bloco = blocoComparavel(v.bloco)
  // Só retira o prefixo quando ele repete o bloco explicitamente informado.
  const prefixo = /[A-Z]/.test(bloco) && unidade.startsWith(bloco)
    && /^(?:\d|L\d)/.test(unidade.slice(bloco.length))
  const local = prefixo ? token(unidade.slice(bloco.length)) : unidade
  return { unidade, bloco, local, completa: bloco ? `${bloco}${local}` : unidade }
}
function compativeis(a: IdentidadeUnidade, b: IdentidadeUnidade) {
  if (a.condominio_id && b.condominio_id && a.condominio_id !== b.condominio_id) return false
  const left = identidade(a), right = identidade(b)
  if (!left.unidade || !right.unidade) return false
  if (left.bloco && right.bloco) return left.bloco === right.bloco && left.local === right.local
  if (!left.bloco && !right.bloco) return left.unidade === right.unidade
  const semBloco = left.bloco ? right : left, comBloco = left.bloco ? left : right
  // "112" sem bloco não autoriza escolher A/112. "A00112" tem evidência do bloco.
  return /[A-Z]/.test(semBloco.unidade) && semBloco.unidade === comBloco.completa
}
/** Resolve aliases e zeros de máscara sem cruzar condomínios ou adivinhar blocos. */
export function resolverCorrespondenciasUnidade<T extends IdentidadeUnidade>(alvo: IdentidadeUnidade, candidatos: T[]) {
  const matches = candidatos.filter(row => compativeis(alvo, row))
  const blocos = new Set(matches.map(row => identidade(row).bloco).filter(Boolean))
  if (blocos.size > 1) return { correspondencias: [] as T[], ambiguo: true }
  return { correspondencias: matches, ambiguo: false }
}
