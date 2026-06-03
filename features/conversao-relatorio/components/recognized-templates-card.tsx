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
    nome: "Office Tamboré · Cobranças OCR",
    categoria: "Cobranças",
    status: "Homologado",
    cobertura: "PDF · Devedores Detalhado digitalizado",
    descricao:
      "Reconhece o PDF OCR do Office Tamboré, reconstrói uma cobrança por recibo, usa VALOR RECIBO como valor importável e ignora as verbas de composição.",
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

const groupedTemplates = templates.reduce<Record<TemplateCategory, RecognizedTemplate[]>>(
  (acc, template) => {
    acc[template.categoria].push(template)
    return acc
  },
  { Unidades: [], Cobranças: [] },
)

export function RecognizedTemplatesCard() {
  const homologados = templates.filter((template) => template.status === "Homologado").length
  const ativos = templates.filter((template) => template.status === "Ativo").length

  return (
    <aside className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
            Padrões ativos
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Layouts reconhecidos
          </h2>
        </div>
        <div className="rounded-2xl bg-slate-950 px-3 py-2 text-right text-white shadow-sm">
          <p className="text-lg font-semibold leading-none">{homologados}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
            homologados
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-500">
        O conversor sempre transforma o arquivo externo na planilha oficial de Importações GKLI. O layout identifica o sistema de origem; o condomínio é confirmado na etapa operacional.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-lg font-semibold text-slate-950">{ativos}</p>
          <p className="text-[11px] font-medium text-slate-500">ativos em validação</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-lg font-semibold text-slate-950">
            {groupedTemplates.Cobranças.length}
          </p>
          <p className="text-[11px] font-medium text-slate-500">modelos de cobranças</p>
        </div>
      </div>

      <div className="mt-5 space-y-6">
        {(Object.keys(groupedTemplates) as TemplateCategory[]).map((categoria) => (
          <section key={categoria}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                {categoria}
              </h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                {groupedTemplates[categoria].length}
              </span>
            </div>

            <div className="space-y-3">
              {groupedTemplates[categoria].map((template) => (
                <div key={template.nome} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-950">{template.nome}</h4>
                      <p className="mt-1 text-[11px] font-medium text-slate-400">
                        {template.cobertura}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone[template.status]}`}
                    >
                      {template.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{template.descricao}</p>
                  {template.exemplos ? (
                    <p className="mt-2 text-[11px] leading-5 text-slate-400">
                      Homologado com: <span className="font-medium text-slate-500">{template.exemplos}</span>
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  )
}
