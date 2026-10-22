/** Números no nome (ex.: Torre 3) não representam uma busca por CNPJ. */
export function clausulasBuscaCondominio(search: string) {
  const term = search.trim().replace(/[%_*]/g, '')
  if (!term) return []
  // Aspas protegem nomes com vírgulas e parênteses na expressão PostgREST.
  const pattern = `"%${term.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}%"`
  const clauses = ['nome', 'nome_operacional', 'administradora'].map(field => `${field}.ilike.${pattern}`)
  if (/^[\d\s./-]+$/.test(term)) {
    const digits = term.replace(/\D/g, '')
    if (digits) clauses.push(`cnpj.ilike.%${digits}%`)
  }
  return clauses
}
