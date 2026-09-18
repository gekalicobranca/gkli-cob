export type NaturezaDebito = 'Taxa condominial' | 'Cessão de espaço' | 'Locação de espaço' | 'Pandemia - natureza a confirmar' | 'Outros débitos' | 'Natureza não discriminada'
export type Valores = { principal: number | null; multa: number | null; correcaoJuros: number | null; total: number }
// Valores financeiros persistidos em centavos inteiros.
export type ReciboRelatorio = Valores & { id: string; bloco: string; unidade: string; responsavel: string; vencimento: string | null }
export type ItemRelatorio = { reciboId: string; conta: string; historico: string; natureza: NaturezaDebito; principal: number | null; total: number | null }
export type AnaliseInadimplencia = {
  versao: 1; arquivo: string; condominioFonte: string; dataBase: string; dataBaseInferida: boolean
  qualidade: 'completa' | 'resumida'; recibos: ReciboRelatorio[]; itens: ItemRelatorio[]
  totais: Valores; observacoes: string[]; encargosPorNatureza: boolean
}
export type ProcessoRelatorio = {
  numero: string; parte: string; unidade: string; bloco?: string; unidadeConfirmada?: boolean
  classe: string; assunto: string; polo: string; situacao: string; advogado: string; escritorio: string
  origem: string; fonte: string; observacoes: string; cobrancaPropria: boolean
  marcacaoAutomaticaPermitida?: boolean
  vinculoNoRelatorio?: 'unidade' | 'nominal'
  debitosCobrados?: Array<{ recibo?: string | null; competencia?: string | null; vencimento?: string | null; valor?: number | null }>
}
export type PreJuridicoRelatorio = { bloco: string; unidade: string; responsavel: string; situacao: string; origem: string }
export type ContextoRelatorio = {
  conferenciasUnidades?: Array<{ bloco: string; unidade: string; situacao: 'judicial' | 'pre_distribuicao'; fonte: string; observacao?: string; conferidoEm: string }>
  processos?: ProcessoRelatorio[]
  preJuridico?: PreJuridicoRelatorio[]
  fontes?: string[]
  atualizadoEm?: string
  jurConsulta?: {
    status: 'sucesso' | 'erro'
    contratoVersao?: 'jur-report-v1'
    consultadoEm: string
    consultaProcessualEm?: string
    cnpjConsultado?: string
    competencia?: string
    erro?: string
    alertas?: string[]
  }
  jurSnapshot?: unknown
}
export type UnidadeRelatorio = Valores & {
  chave: string; bloco: string; unidade: string; responsaveis: string[]; mais60: number | null; mais5: number | null; entre60e5: number | null
  maisAntigo: string | null; maisRecente: string | null; processos: ProcessoRelatorio[]; preJuridico: boolean; indicacaoApp?: boolean
  conferencia?: NonNullable<ContextoRelatorio['conferenciasUnidades']>[number]
}
export const DISCLAIMER = 'Relatório produzido com base em informações públicas e privadas, protegido pela LGPD e destinado somente para pessoas autorizadas. Não reproduzir esse conteúdo de forma parcial ou completa.'
export const normalizar = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/gi, ' ').trim().toUpperCase()
export const chaveUnidade = (bloco: unknown, unidade: unknown) => {
  let b = normalizar(bloco), u = normalizar(unidade)
  const composto = u.match(/^(\d+) ([A-Z]+)$/)
  if (composto && (!b || b === '0' || b === composto[2])) { b = composto[2]; u = composto[1] }
  return `${b}::${u.replace(/^0+(?=\d)/, '')}`
}
export function dataIso(v: unknown): string | null {
  const s = String(v ?? '').trim(); const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : s.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const d = new Date(iso + 'T00:00:00Z'); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null
}
export function cortes(dataBase: string, dias = 60) {
  const d = new Date(dataBase + 'T00:00:00Z'); const cinco = new Date(d)
  cinco.setUTCFullYear(d.getUTCFullYear() - 5)
  if (cinco.getUTCMonth() !== d.getUTCMonth()) cinco.setUTCDate(0)
  return { sessenta: new Date(d.getTime() - dias * 86400000).toISOString().slice(0, 10), cinco: cinco.toISOString().slice(0, 10) }
}
export function natureza(historico: string, conta = '', formato = ''): NaturezaDebito {
  const s = normalizar(historico)
  if(formato === 'condopro' && /^COND\b/.test(s)) return 'Taxa condominial'
  if (formato === 'hubert' && conta === '1002' && /^(COTA |C |CONDOMINIO)/.test(s)) return 'Taxa condominial'
  if (/\bCONDOMINIO\b|\bTAXA CONDOMINIAL\b/.test(s)) return 'Taxa condominial'
  if (/\bCOTAS? CONDOMINIA(?:L|IS)\b/.test(s)) return 'Taxa condominial'
  if (/^(?:(?:TX|TAXA) COND|COND)\b/.test(s)) return 'Taxa condominial'
  if (/^(?:TX COND|COND) (?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\b/.test(s)) return 'Taxa condominial'
  if (/\bCESSAO\b/.test(s)) return 'Cessão de espaço'
  if (/\bLOCACAO\b/.test(s) || (formato === 'hubert' && conta === '1003' && s === 'AL SALAO FESTAS')) return 'Locação de espaço'
  if (/PANDEMI/.test(s)) return 'Pandemia - natureza a confirmar'
  return 'Outros débitos'
}
export function somarValores(recibos: Valores[]): Valores {
  const soma = (k: keyof Valores) => recibos.some(r => r[k] === null) ? null : recibos.reduce((s, r) => s + (r[k] ?? 0), 0)
  return { principal: soma('principal'), multa: soma('multa'), correcaoJuros: soma('correcaoJuros'), total: recibos.reduce((s, r) => s + r.total, 0) }
}
export function estadoProcesso(p: ProcessoRelatorio) {
  const s = normalizar(p.situacao)
  if (/EXTINT|CANCELAD|ARQUIVAD|ENCERRAD/.test(s)) return 'historico'
  if (/SUSPENS/.test(s)) return 'suspenso'
  if (/PUBLICACAO MAIS RECENTE|EM TRAMITACAO|EM ANDAMENTO|EM GRAU DE RECURSO/.test(s)) return 'recente'
  return 'nao_confirmado'
}
export function marcaEscritorio(p: ProcessoRelatorio) {
  if (/\bLIDIANE\b/.test(normalizar(p.advogado)) || /\bGENSKE\b/.test(normalizar(p.escritorio))) return /CARLA PATRICIA/.test(normalizar(p.escritorio)) ? 'G+O' : 'G'
  return !p.escritorio || /^NAO IDENTIFICADO/.test(normalizar(p.escritorio)) ? 'NI' : 'O'
}
// A associação nominal apenas relaciona fontes; não judicializa o saldo.
export function nomeParaAssociacao(value: string) {
  return normalizar(value).replace(/ E OUTROS$/, '').replace(/(?:\s+(?:LTDA|EIRELI|EPP|ME|S A))+$/, '').trim()
}
function partesParaAssociacao(parte: string, condominio: string) {
  const nomeCondominio = nomeCondominioParaAssociacao(condominio)
  return parte.split(';').flatMap(valor => {
    const lados = valor.split(/\s+[xX]\s+/)
    // Só interpretar o título quando um lado identifica exatamente este condomínio.
    if (lados.length === 2 && nomeCondominio && lados.some(lado => nomeCondominioParaAssociacao(lado) === nomeCondominio)) {
      return lados.filter(lado => nomeCondominioParaAssociacao(lado) !== nomeCondominio)
    }
    return [valor]
  }).map(nomeParaAssociacao).filter(Boolean)
}
function nomeCondominioParaAssociacao(value: string) {
  return normalizar(value).replace(/^\d+\s+/, '').replace(/^(?:CONDOMINIO|COND)\s+/, '')
}
function unidadeExplicitaNoTitulo(parte: string, condominio: string) {
  const match = parte.match(/^(.*?)\s*-\s*UNIDADE\s*-\s*(\d+)\s+([A-Z]+)$/i)
  return match && nomeCondominioParaAssociacao(match[1]) === nomeCondominioParaAssociacao(condominio)
    ? chaveUnidade(match[3], match[2]) : null
}
export function consolidar(analise: AnaliseInadimplencia, contexto: ContextoRelatorio = {}, app: Array<{ bloco: string; unidade: string; acaoJudicial: boolean }> = [], inicioCobrancaDias?: number): UnidadeRelatorio[] {
  const groups = new Map<string, ReciboRelatorio[]>(); const c = cortes(analise.dataBase, inicioCobrancaDias)
  for (const r of analise.recibos) { const k = chaveUnidade(r.bloco, r.unidade); groups.set(k, [...(groups.get(k) ?? []), r]) }
  return [...groups].map(([chave, rs]) => {
    const nomes = [...new Set(rs.map(r => r.responsavel).filter(Boolean))]
    const datas = rs.map(r => r.vencimento).filter((v): v is string => Boolean(v)).sort()
    const idadeDisponivel = rs.every(r => r.vencimento)
    const faixa = (pred: (v: string) => boolean) => idadeDisponivel ? rs.filter(r => pred(r.vencimento!)).reduce((s, r) => s + r.total, 0) : null
    const processos = (contexto.processos ?? []).flatMap(p => {
      if (!p.cobrancaPropria) return []
      const porUnidade = (p.unidadeConfirmada && chaveUnidade(p.bloco ?? '', p.unidade) === chave)
        || unidadeExplicitaNoTitulo(p.parte, analise.condominioFonte) === chave
      const porNome = partesParaAssociacao(p.parte, analise.condominioFonte).some(parte => nomes.some(n => nomeParaAssociacao(n) === parte))
      if (!porUnidade && !porNome) return []
      // A restrição do Jur continua preservada: a referência não confirma os débitos abrangidos.
      return [{ ...p, vinculoNoRelatorio: porUnidade ? 'unidade' as const : 'nominal' as const }]
    })
    const conferencia = contexto.conferenciasUnidades?.find(u => chaveUnidade(u.bloco, u.unidade) === chave)
    return { ...somarValores(rs), chave, bloco: rs[0].bloco, unidade: rs[0].unidade, responsaveis: nomes,
      mais60: faixa(d => inicioCobrancaDias == null ? d < c.sessenta : d <= c.sessenta), mais5: faixa(d => d < c.cinco), entre60e5: faixa(d => (inicioCobrancaDias == null ? d < c.sessenta : d <= c.sessenta) && d > c.cinco),
      maisAntigo: datas[0] ?? null, maisRecente: datas.at(-1) ?? null, processos,
      preJuridico: conferencia?.situacao === 'pre_distribuicao' || (contexto.preJuridico ?? []).some(p => chaveUnidade(p.bloco, p.unidade) === chave),
      conferencia,
      indicacaoApp: app.some(u => chaveUnidade(u.bloco, u.unidade) === chave && u.acaoJudicial),
    }
  }).sort((a, b) => b.total - a.total)
}


/** Categorias exclusivas por recibo; correspondência apenas nominal não judicializa saldo. */
export function distribuirInadimplencia(analise: AnaliseInadimplencia, units: UnidadeRelatorio[], dias: number) {
  const valores = { administradora: 0, ativa: 0, preJuridico: 0, judicial: 0, semData: 0 }
  const limite = cortes(analise.dataBase, dias).sessenta
  const byKey = new Map(units.map(u => [u.chave, u]))
  for (const r of analise.recibos) {
    const u = byKey.get(chaveUnidade(r.bloco, r.unidade))
    const judicial = u?.conferencia?.situacao === 'judicial' || u?.indicacaoApp || u?.processos.some(p => p.vinculoNoRelatorio === 'unidade' && estadoProcesso(p) !== 'historico')
    if (u?.conferencia?.situacao === 'pre_distribuicao') valores.preJuridico += r.total
    else if (judicial) valores.judicial += r.total
    else if (u?.preJuridico) valores.preJuridico += r.total
    else if (!r.vencimento) valores.semData += r.total
    else if (r.vencimento <= limite) valores.ativa += r.total
    else valores.administradora += r.total
  }
  return valores
}
