import type { CockpitItem } from '@/features/cockpit/rules'

function documentoValido(value?: string | null) {
  const doc = (value ?? '').replace(/\D/g, '')
  if (![11, 14].includes(doc.length) || /^(\d)\1+$/.test(doc)) return null
  const digito = (base: string) => {
    const pesos = base.length < 12 ? Array.from({ length: base.length }, (_, i) => base.length + 1 - i)
      : Array.from({ length: base.length }, (_, i) => ((base.length - 1 - i) % 8) + 2)
    const resto = [...base].reduce((sum, n, i) => sum + Number(n) * pesos[i], 0) % 11
    return resto < 2 ? '0' : String(11 - resto)
  }
  const base = doc.slice(0, -2)
  const primeiro = digito(base)
  return base + primeiro + digito(base + primeiro) === doc ? doc : null
}

export function agruparInbox(itens: CockpitItem[]) {
  const grupos = new Map<string, CockpitItem[]>()
  for (const item of itens) {
    // Sem documento válido, conserva a unidade: nomes iguais nunca unem pessoas.
    const pessoa = documentoValido(item.responsavelDocumento)
    const key = `${item.condominioId ?? item.id}:${pessoa ? 'documento:' + pessoa : 'unidade:' + (item.unidadeId ?? item.id)}`
    const rows = grupos.get(key) ?? []
    if (!rows.some(row => row.tipo === item.tipo && row.id === item.id)) rows.push(item)
    grupos.set(key, rows)
  }
  return [...grupos].map(([id, rows]) => {
    const items = [...rows].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    const primeiro = items[0]
    const cobrancas = items.filter(i => i.tipo === 'cobranca')
    const acordos = items.filter(i => i.tipo === 'acordo')
    const ultimas = cobrancas.map(i => i.ultimaInteracaoAt).filter((d): d is string => Boolean(d)).sort()
    return {
      id, items, primeiro, cobrancas, acordos,
      responsavel: primeiro.responsavelNome || 'Responsável não informado',
      condominio: primeiro.condominioNome || 'Condomínio não informado',
      unidades: [...new Set(items.map(i => i.unidadeLabel).filter(Boolean))],
      valorCobrancas: cobrancas.reduce((sum, i) => sum + i.valor, 0),
      valorAcordos: acordos.reduce((sum, i) => sum + i.valor, 0),
      ultimaInteracao: ultimas.at(-1) ?? null,
      contatos: [...new Set(items.flatMap(i => [i.email, i.telefone]).filter(Boolean))],
    }
  }).sort((a, b) => b.primeiro.score - a.primeiro.score || b.valorCobrancas - a.valorCobrancas || a.id.localeCompare(b.id))
}
