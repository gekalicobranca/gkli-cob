type TemplateStatus = "Homologado" | "Ativo" | "Próxima fase"
type TemplateCategory = "Unidades" | "Cobranças"

type RecognizedTemplate = {
  nome: string
  categoria: TemplateCategory
  status: TemplateStatus
  cobertura: string
  descricao: string
  exemplos?: string
}

const templates: RecognizedTemplate[] = [
  {
    nome: "Superlógica · Unidades",
    categoria: "Unidades",
    status: "Ativo",
    cobertura: "PDF · Relatório de Unidades Completo",
    descricao:
      "Valida qualidade do texto, descarta PDFs com encoding inseguro e gera XLSX somente com as colunas oficiais de Importações/Unidades.",
  },
  {
    nome: "Hflex / LiveFacilities · Unidades",
    categoria: "Unidades",
    status: "Ativo",
    cobertura: "PDF · Relatório de Unidades",
    descricao:
      "Corrige textos com glifos duplicados, extrai unidade, titular, documento, telefone e e-mail, e gera XLSX para Importações/Unidades.",
  },
  {
    nome: "Superlógica · Cobranças",
    categoria: "Cobranças",
    status: "Homologado",
    cobertura: "PDF · Relação Analítica de Pendentes",
    descricao:
      "Extrai recibos, vencimentos, totais por unidade, marcadores A/AE/AJ/J/D/B/P e gera a planilha oficial de Importações/Cobranças.",
    exemplos: "Lavance, Bem Moema, Ápice, Metrocasa e Jequitibás",
  },
  {
    nome: "Hflex / LiveFacilities · Cobranças",
    categoria: "Cobranças",
    status: "Homologado",
    cobertura: "PDF · Devedores Detalhado",
    descricao:
      "Reconhece bloco/unidade, recibo, vencimento, valor e resumo por unidade. Usa os totais finais do relatório como conferência.",
    exemplos: "Cipó e Tamboré",
  },
  {
    nome: "CondoPro / BBZ · Cobranças",
    categoria: "Cobranças",
    status: "Homologado",
    cobertura: "PDF · Informe a Unidade / Total Geral da Unidade",
    descricao:
      "Agrupa as linhas por recibo, captura marcadores A/AE e converte cada recibo em uma cobrança única no padrão GKLI.",
    exemplos: "Panorama Vila Romana",
  },
  {
    nome: "Slaviero · Cobranças",
    categoria: "Cobranças",
    status: "Homologado",
    cobertura: "PDF · Inadimplentes",
    descricao:
      "Extrai unidade, responsável, vencimento, competência, código, principal, juros, multa, honorários e total; marca Jurídico como situação de origem.",
    exemplos: "Moema Flat e demais relatórios Slaviero",
  },
  {
    nome: "Moema Flat · Cobranças",
    categoria: "Cobranças",
    status: "Homologado",
    cobertura: "PDF · Slaviero Inadimplentes",
    descricao:
      "Especialização do layout Slaviero para o Edifício Moema Flat Service, incluindo unidades numéricas, unidade REST-LEMON e marcador Jurídico quando presente no cabeçalho.",
    exemplos: "W003A Edifício Moema Flat Service",
  },
  {
    nome: "Safira · Cobranças",
    categoria: "Cobranças",
    status: "Homologado",
    cobertura: "PDF · Relatórios de Recibos em Aberto",
    descricao:
      "Converte cada linha de débito em uma cobrança GKLI usando somente Valor do Recibo como valor importável; multa, correção, juros e Valor Total ficam apenas nas observações.",
    exemplos: "Safira",
  },
  {
    nome: "Lello · Cobranças",
    categoria: "Cobranças",
    status: "Homologado",
    cobertura: "PDF · Cota / Débitos",
    descricao:
      "Trata Código como recibo, gera uma cobrança por código e preserva a composição das contas em observações para conferência.",
    exemplos: "VN Casa Topázio",
  },
  {
    nome: "Conectcon · Cobranças",
    categoria: "Cobranças",
    status: "Ativo",
    cobertura: "XLS / HTML · Linhas diretas",
    descricao:
      "Importa layouts tabulares com unidade, nome, vencimento, referência e valor, gerando a saída oficial de Importações/Cobranças.",
  },
  {
    nome: "Office Tamboré · Cobranças",
    categoria: "Cobranças",
    status: "Homologado",
    cobertura: "PDF OCR / XLS / XLSX · Devedores Detalhado",
    descricao:
      "Reconhece o PDF OCR e também o XLS/XLSX exportado do Office Tamboré, gerando uma cobrança por recibo e usando Vl. Recibo como valor importável.",
    exemplos: "Subcondomínio Edifício Office Tamboré",
  },
  {
    nome: "Cipó · Cobranças OCR",
    categoria: "Cobranças",
    status: "Homologado",
    cobertura: "XLSX · PDF digitalizado convertido por OCR",
    descricao:
      "Reconstrói cobranças a partir das abas Table do OCR, identifica unidade Cipó, recibo, acordo, vencimento e valor do recibo, ignorando linhas de composição.",
    exemplos: "Torre Cipó",
  },
  {
    nome: "Novos fornecedores",
    categoria: "Cobranças",
    status: "Próxima fase",
    cobertura: "Parser próprio por administradora/sistema",
    descricao:
      "Cada novo layout entra como padrão independente. O condomínio detectado é dado operacional, não regra de reconhecimento do parser.",
  },
]

const statusTone: Record<TemplateStatus, string> = {
  Homologado: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  Ativo: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
  "Próxima fase": "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
}

const cobrancasTemplates = templates.filter((template) => template.categoria === "Cobranças")
const unidadesTemplates = templates.filter((template) => template.categoria === "Unidades")
const homologadosCobrancas = cobrancasTemplates.filter(
  (template) => template.status === "Homologado",
).length

function StatusPill({ status }: { status: TemplateStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone[status]}`}
    >
      {status}
    </span>
  )
}

function CompactTemplateRow({ template }: { template: RecognizedTemplate }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">{template.nome}</p>
        <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
          {template.cobertura}
          {template.exemplos ? ` · ${template.exemplos}` : ""}
        </p>
      </div>
      <StatusPill status={template.status} />
    </li>
  )
}

export function RecognizedTemplatesCard() {
  return (
    <aside className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
            Padrões homologados
          </p>
          <h2 className="mt-2 text-lg font-semibold text-slate-950">
            Cobranças em primeiro plano
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Lista compacta dos parsers disponíveis. A operação principal desta tela é converter inadimplência para o XLSX oficial de Importações/Cobranças.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
          <div className="rounded-2xl bg-slate-950 px-3 py-2 text-white">
            <p className="text-lg font-semibold leading-none">{homologadosCobrancas}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
              homologados
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2">
            <p className="text-lg font-semibold leading-none text-slate-950">
              {cobrancasTemplates.length}
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              cobranças
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2">
            <p className="text-lg font-semibold leading-none text-slate-950">
              {unidadesTemplates.length}
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              secundários
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
        {cobrancasTemplates.map((template) => (
          <CompactTemplateRow key={template.nome} template={template} />
        ))}
      </div>

      <details className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          Ver padrões secundários de unidades/responsáveis
        </summary>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {unidadesTemplates.map((template) => (
            <CompactTemplateRow key={template.nome} template={template} />
          ))}
        </div>
      </details>
    </aside>
  )
}
