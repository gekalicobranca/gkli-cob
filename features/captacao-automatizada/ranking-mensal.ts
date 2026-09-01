import * as XLSX from "xlsx"
import { ACORDO_STATUS_VIGENTES } from "@/lib/constants/acordos"
import { COBRANCA_STATUS_OPERACIONAL } from "@/lib/constants/cobrancas"
import { avaliarReguaImportacao } from "@/features/importacoes/regua-importacao"

type SupabaseLike = {
  from: (table: string) => any
}

type CobrancaRankingInput = {
  bloco?: string | null
  unidade?: string | null
  responsavel?: string | null
  vencimento?: string | null
  vencimentoMaisAntigo?: string | null
  valorTotal?: number | null
  valorPrincipal?: number | null
  multa?: number | null
  correcao?: number | null
  juros?: number | null
  recibo?: string | null
  marcadorOrigem?: string | null
  situacaoOrigem?: string | null
}

export type RankingMensalStatus =
  | "Administrativo"
  | "Extrajudicial"
  | "Acordo"
  | "Pré-distribuição"
  | "Ação judicial em trâmite"
  | "A classificar"

export type RankingMensalUnidade = {
  bloco: string
  unidade: string
  responsavel: string
  status: RankingMensalStatus
  debitoInicial: string
  debitoFinal: string
  valor: number
  andamento: string
  valorPrincipal: number
  multa: number
  correcao: number
  juros: number
  recibos: string[]
  marcadoresOrigem: string[]
  situacoesOrigem: string[]
}

export type RankingMensalCaptacao = {
  tipo: "ranking_mensal_captacao"
  versao: 1
  competencia: string
  arquivoOrigem: string
  condominio?: string | null
  geradoEm: string
  totalUnidades: number
  valorTotal: number
  unidades: RankingMensalUnidade[]
  resumoStatus: Array<{ status: RankingMensalStatus; unidades: number; valor: number }>
  xlsxBase64: string
}

function roundMoney(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function normalizar(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
}

function chaveUnidade(bloco: unknown, unidade: unknown) {
  return `${normalizar(bloco)}::${normalizar(unidade).replace(/^0+(?=\d)/, "")}`
}

function compareBrDates(a?: string | null, b?: string | null) {
  const parse = (value?: string | null) => {
    const match = String(value ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (!match) return 0
    return Number(`${match[3]}${match[2]}${match[1]}`)
  }
  return parse(a) - parse(b)
}

function competenciaFromArquivoOuData(arquivoOrigem: string, cobrancas: CobrancaRankingInput[]) {
  const arquivoDate = arquivoOrigem.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (arquivoDate) return `${arquivoDate[1]}-${arquivoDate[2]}`

  const datas = cobrancas
    .map((item) => item.vencimento ?? item.vencimentoMaisAntigo)
    .filter(Boolean)
    .sort(compareBrDates)
  const ultima = datas[datas.length - 1]
  const match = String(ultima ?? "").match(/^\d{2}\/(\d{2})\/(\d{4})$/)
  return match ? `${match[2]}-${match[1]}` : new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date())
}

function statusResumo(unidades: RankingMensalUnidade[]) {
  const grouped = new Map<RankingMensalStatus, { status: RankingMensalStatus; unidades: number; valor: number }>()
  for (const unidade of unidades) {
    const current = grouped.get(unidade.status) ?? { status: unidade.status, unidades: 0, valor: 0 }
    current.unidades += 1
    current.valor = roundMoney(current.valor + unidade.valor)
    grouped.set(unidade.status, current)
  }
  return [...grouped.values()].sort((a, b) => a.status.localeCompare(b.status, "pt-BR"))
}

function buildRankingWorkbookBase64(ranking: Omit<RankingMensalCaptacao, "xlsxBase64">) {
  const workbook = XLSX.utils.book_new()
  const detalhe = [
    ["Bloco", "Unidade", "Status", "Débito Inicial", "Débito Final", "Valor", "Andamento"],
    ...ranking.unidades.map((item) => [
      item.bloco,
      item.unidade,
      item.status,
      item.debitoInicial,
      item.debitoFinal,
      item.valor,
      item.andamento,
    ]),
  ]
  const resumo = [
    ["Status", "Unidades", "Valor"],
    ...ranking.resumoStatus.map((item) => [item.status, item.unidades, item.valor]),
    ["Total Geral", ranking.totalUnidades, ranking.valorTotal],
  ]
  const wsDetalhe = XLSX.utils.aoa_to_sheet(detalhe)
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo)
  wsDetalhe["!cols"] = [{ wch: 10 }, { wch: 14 }, { wch: 26 }, { wch: 15 }, { wch: 15 }, { wch: 14 }, { wch: 72 }]
  wsResumo["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(workbook, wsDetalhe, "Débito")
  XLSX.utils.book_append_sheet(workbook, wsResumo, "Resumo")
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
  return bytes.toString("base64")
}

function withWorkbook(ranking: Omit<RankingMensalCaptacao, "xlsxBase64">): RankingMensalCaptacao {
  return {
    ...ranking,
    xlsxBase64: buildRankingWorkbookBase64(ranking),
  }
}

export function buildRankingMensalFromCobrancas(
  cobrancas: CobrancaRankingInput[],
  options: { arquivoOrigem: string; condominio?: string | null; geradoEm?: string },
): RankingMensalCaptacao | null {
  if (!cobrancas.length) return null
  const grouped = new Map<string, RankingMensalUnidade>()

  for (const cobranca of cobrancas) {
    const bloco = String(cobranca.bloco ?? "").trim()
    const unidade = String(cobranca.unidade ?? "").trim()
    if (!unidade) continue
    const key = chaveUnidade(bloco, unidade)
    const vencimento = cobranca.vencimento ?? cobranca.vencimentoMaisAntigo ?? ""
    const current = grouped.get(key) ?? {
      bloco,
      unidade,
      responsavel: String(cobranca.responsavel ?? "").trim(),
      status: "A classificar" as const,
      debitoInicial: vencimento,
      debitoFinal: vencimento,
      valor: 0,
      andamento: "Classificação operacional será concluída na importação.",
      valorPrincipal: 0,
      multa: 0,
      correcao: 0,
      juros: 0,
      recibos: [],
      marcadoresOrigem: [],
      situacoesOrigem: [],
    }

    if (vencimento && (!current.debitoInicial || compareBrDates(vencimento, current.debitoInicial) < 0)) current.debitoInicial = vencimento
    if (vencimento && (!current.debitoFinal || compareBrDates(vencimento, current.debitoFinal) > 0)) current.debitoFinal = vencimento
    current.valor = roundMoney(current.valor + Number(cobranca.valorTotal ?? 0))
    current.valorPrincipal = roundMoney(current.valorPrincipal + Number(cobranca.valorPrincipal ?? cobranca.valorTotal ?? 0))
    current.multa = roundMoney(current.multa + Number(cobranca.multa ?? 0))
    current.correcao = roundMoney(current.correcao + Number(cobranca.correcao ?? 0))
    current.juros = roundMoney(current.juros + Number(cobranca.juros ?? 0))
    if (cobranca.recibo && !current.recibos.includes(cobranca.recibo)) current.recibos.push(cobranca.recibo)
    if (cobranca.marcadorOrigem && !current.marcadoresOrigem.includes(cobranca.marcadorOrigem)) current.marcadoresOrigem.push(cobranca.marcadorOrigem)
    if (cobranca.situacaoOrigem && !current.situacoesOrigem.includes(cobranca.situacaoOrigem)) current.situacoesOrigem.push(cobranca.situacaoOrigem)
    grouped.set(key, current)
  }

  const unidades = [...grouped.values()].sort((a, b) =>
    String(a.bloco).localeCompare(String(b.bloco), "pt-BR", { numeric: true }) ||
    String(a.unidade).localeCompare(String(b.unidade), "pt-BR", { numeric: true }),
  )
  const base = {
    tipo: "ranking_mensal_captacao" as const,
    versao: 1 as const,
    competencia: competenciaFromArquivoOuData(options.arquivoOrigem, cobrancas),
    arquivoOrigem: options.arquivoOrigem,
    condominio: options.condominio ?? null,
    geradoEm: options.geradoEm ?? new Date().toISOString(),
    totalUnidades: unidades.length,
    valorTotal: roundMoney(unidades.reduce((sum, item) => sum + item.valor, 0)),
    unidades,
    resumoStatus: statusResumo(unidades),
  }
  return withWorkbook(base)
}

function statusFromOperacional(statuses: string[]) {
  if (statuses.includes(COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO)) return "Ação judicial em trâmite"
  if (statuses.includes(COBRANCA_STATUS_OPERACIONAL.ACORDO_EFETIVADO) || statuses.includes(COBRANCA_STATUS_OPERACIONAL.ACORDO_FIRMADO)) return "Acordo"
  if (statuses.includes(COBRANCA_STATUS_OPERACIONAL.PRE_JURIDICO)) return "Pré-distribuição"
  if (statuses.some((status) => [
    COBRANCA_STATUS_OPERACIONAL.NOVO,
    COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA,
    COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO,
    COBRANCA_STATUS_OPERACIONAL.POSSIVEL_ACORDO,
  ].includes(status as any))) return "Extrajudicial"
  return null
}

function andamentoPadrao(status: RankingMensalStatus, inicioCobrancaDias?: number | null) {
  switch (status) {
    case "Ação judicial em trâmite":
      return "Ação judicial em trâmite identificada no app."
    case "Acordo":
      return "Acordo vigente localizado no app."
    case "Pré-distribuição":
      return "Unidade em preparação pré-jurídica no app."
    case "Administrativo":
      return `Unidade aos cuidados da administradora, atuação do escritório com ${inicioCobrancaDias ?? 60} dias de atraso.`
    case "Extrajudicial":
      return "Cobrança extrajudicial em acompanhamento pelo escritório."
    default:
      return "Classificação operacional pendente."
  }
}

export async function classificarRankingMensalComApp(
  supabase: SupabaseLike,
  ranking: RankingMensalCaptacao | null | undefined,
  params: { condominioId: string; inicioCobrancaDias?: number | null },
) {
  if (!ranking?.unidades?.length) return ranking ?? null

  const { data: unidades, error: unidadesError } = await supabase
    .from("unidades")
    .select("id, identificacao, bloco, acao_judicial")
    .eq("condominio_id", params.condominioId)
  if (unidadesError) throw new Error(`Erro ao classificar ranking mensal: ${unidadesError.message}`)

  const unidadeByKey = new Map<string, any>()
  for (const unidade of unidades ?? []) {
    unidadeByKey.set(chaveUnidade(unidade.bloco, unidade.identificacao), unidade)
  }
  const unidadeIds = [...unidadeByKey.values()].map((item) => item.id).filter(Boolean)
  const [cobrancasResult, acordosResult] = unidadeIds.length ? await Promise.all([
    supabase
      .from("cobrancas")
      .select("id, unidade_id, status_operacional, vencimento, created_at")
      .in("unidade_id", unidadeIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("acordos")
      .select("id, unidade_id, status, created_at")
      .in("unidade_id", unidadeIds)
      .in("status", ACORDO_STATUS_VIGENTES as string[])
      .order("created_at", { ascending: false }),
  ]) : [{ data: [] }, { data: [] }] as any

  if (cobrancasResult.error) throw new Error(`Erro ao buscar cobranças para ranking: ${cobrancasResult.error.message}`)
  if (acordosResult.error) throw new Error(`Erro ao buscar acordos para ranking: ${acordosResult.error.message}`)

  const cobrancasPorUnidade = new Map<string, any[]>()
  for (const cobranca of cobrancasResult.data ?? []) {
    const list = cobrancasPorUnidade.get(cobranca.unidade_id) ?? []
    list.push(cobranca)
    cobrancasPorUnidade.set(cobranca.unidade_id, list)
  }
  const acordosPorUnidade = new Set((acordosResult.data ?? []).map((item: any) => item.unidade_id))

  const unidadesClassificadas = ranking.unidades.map((item) => {
    const unidade = unidadeByKey.get(chaveUnidade(item.bloco, item.unidade))
    const statuses = (cobrancasPorUnidade.get(unidade?.id) ?? []).map((row: any) => String(row.status_operacional ?? ""))
    const regua = avaliarReguaImportacao({
      vencimento: item.debitoInicial,
      inicioCobrancaDias: params.inicioCobrancaDias,
    })
    let status: RankingMensalStatus =
      unidade?.acao_judicial ? "Ação judicial em trâmite" :
      acordosPorUnidade.has(unidade?.id) ? "Acordo" :
      (statusFromOperacional(statuses) as RankingMensalStatus | null) ??
      (regua.foraRegua ? "Administrativo" : "Extrajudicial")

    if (item.situacoesOrigem.includes("acordo") && status === "Extrajudicial" && acordosPorUnidade.has(unidade?.id)) {
      status = "Acordo"
    }

    return {
      ...item,
      status,
      andamento: andamentoPadrao(status, params.inicioCobrancaDias),
    }
  })

  const base = {
    ...ranking,
    geradoEm: new Date().toISOString(),
    unidades: unidadesClassificadas,
    totalUnidades: unidadesClassificadas.length,
    valorTotal: roundMoney(unidadesClassificadas.reduce((sum, item) => sum + item.valor, 0)),
    resumoStatus: statusResumo(unidadesClassificadas),
  }
  return withWorkbook(base)
}
