import { getCobrancaStatusOperacional } from '@/lib/core/cobranca-status'

export type CotaCatalogo = {
  id: string; carteira_id: string; condominio_id: string; unidade_id: string | null
  competencia?: string | null; vencimento: string; valor_original?: number | string | null
  valor_atualizado?: number | string | null; status?: string | null
  status_operacional?: string | null; status_financeiro?: string | null
  indicativo_catalogo?: { juridico: boolean; pre: boolean }
  carteiras?: { nome: string } | null
  condominios?: { nome: string; inicio_cobranca_dias?: number | null } | null
  unidades?: { identificacao: string; bloco?: string | null; responsavel_nome?: string | null; telefone?: string | null; email?: string | null; acao_judicial?: boolean | null } | null
}
export type UnidadeCatalogo = {
  id: string; dados: CotaCatalogo['unidades']; cotas: (CotaCatalogo & { centavos: number })[]
  total: number; juridico: boolean; pre: boolean
}
export type CondominioCatalogo = {
  id: string; carteira: string; carteiraId: string; nome: string; dias: number
  unidades: UnidadeCatalogo[]; total: number
}
export function dataCatalogo(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
}
export function montarCatalogo(rows: CotaCatalogo[], dataBase: string): CondominioCatalogo[] {
  const comparar = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true })
  const grupos = new Map<string, CondominioCatalogo>()
  const indicativos = new Map<string, { juridico: boolean; pre: boolean }>()
  const chaveUnidade = (r: CotaCatalogo) => `${r.carteira_id}/${r.condominio_id}/${r.unidade_id ?? r.id}`
  for (const r of rows) {
    const chave = chaveUnidade(r), atual = indicativos.get(chave) ?? { juridico: false, pre: false }
    const status = getCobrancaStatusOperacional(r)
    atual.juridico ||= Boolean(r.unidades?.acao_judicial) || status === 'judicializado' || Boolean(r.indicativo_catalogo?.juridico)
    atual.pre ||= status === 'pre_juridico' || Boolean(r.indicativo_catalogo?.pre)
    indicativos.set(chave, atual)
  }
  const vistos = new Set<string>()
  for (const r of rows) {
    if (vistos.has(r.id)) continue
    vistos.add(r.id)
    const status = getCobrancaStatusOperacional(r)
    if (!['novo', 'em_cobranca_ativa', 'em_negociacao', 'possivel_acordo', 'pre_juridico', 'judicializado'].includes(status)) continue
    if (['quitado', 'pago', 'cancelado', 'renegociado'].includes(String(r.status_financeiro ?? '').toLowerCase())) continue
    const diasInformados = Number(r.condominios?.inicio_cobranca_dias ?? 30)
    const dias = Number.isFinite(diasInformados) ? Math.max(0, diasInformados) : 30
    const atraso = (Date.parse(`${dataBase}T00:00:00Z`) - Date.parse(`${r.vencimento}T00:00:00Z`)) / 86400000
    const centavos = Math.round(Number(r.valor_atualizado ?? r.valor_original ?? 0) * 100)
    if (!Number.isFinite(atraso) || atraso <= 0 || atraso < dias || !Number.isFinite(centavos) || centavos <= 0) continue
    const key = `${r.carteira_id}/${r.condominio_id}`
    let grupo = grupos.get(key)
    if (!grupo) {
      grupo = { id: r.condominio_id, carteiraId: r.carteira_id, carteira: r.carteiras?.nome || 'Carteira não informada', nome: r.condominios?.nome || 'Condomínio não informado', dias, unidades: [], total: 0 }
      grupos.set(key, grupo)
    }
    const id = chaveUnidade(r)
    let unidade = grupo.unidades.find(u => u.id === id)
    if (!unidade) {
      unidade = { id, dados: r.unidades, cotas: [], total: 0, ...indicativos.get(id)! }
      grupo.unidades.push(unidade)
    }
    unidade.cotas.push({ ...r, centavos }); unidade.total += centavos; grupo.total += centavos
  }
  for (const grupo of grupos.values()) {
    grupo.unidades.sort((a, b) => b.total - a.total || comparar(a.dados?.bloco ?? '', b.dados?.bloco ?? '') || comparar(a.dados?.identificacao ?? '', b.dados?.identificacao ?? '') || comparar(a.id, b.id))
    for (const unidade of grupo.unidades) unidade.cotas.sort((a, b) => comparar(a.vencimento, b.vencimento) || comparar(a.id, b.id))
  }
  return [...grupos.values()].sort((a, b) => comparar(a.carteira, b.carteira) || comparar(a.carteiraId, b.carteiraId) || comparar(a.nome, b.nome) || comparar(a.id, b.id))
}
