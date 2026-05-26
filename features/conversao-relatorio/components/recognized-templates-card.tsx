const templates = [
  {
    nome: "Superlógica · Unidades",
    status: "Ativo",
    descricao: "PDF de Relatório de Unidades - Completo. Detecta condomínio, bloco, unidade, responsável, CPF/CNPJ, telefone/e-mail e gera XLSX para Importações/Unidades.",
  },
  {
    nome: "Hflex / LiveFacilities · Unidades",
    status: "Ativo",
    descricao: "Parser de Relatório de Unidades em PDF. Detecta o fornecedor Hflex/LiveFacilities, identifica o condomínio no documento e gera XLSX para Importações/Unidades.",
  },
  {
    nome: "Conectcon · Cobranças",
    status: "Ativo",
    descricao: "XLS/HTML em linhas diretas: unidade, nome, vencimento, referência e valor.",
  },
  {
    nome: "Condopro/BBZ · Cobranças",
    status: "Ativo",
    descricao: "XLS/HTML por blocos de unidade, com 1 cobrança por recibo e saída em XLSX padrão GKLI.",
  },
  {
    nome: "Novos fornecedores",
    status: "Próxima fase",
    descricao: "Cada administradora/sistema entra como padrão ativo próprio, sem depender do nome do condomínio.",
  },
]

export function RecognizedTemplatesCard() {
  return (
    <aside className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
        Padrões ativos
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">Layouts reconhecidos</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Esta lista representa os parsers disponíveis. O condomínio detectado no arquivo é dado operacional, não o padrão do layout.
      </p>

      <div className="mt-5 space-y-3">
        {templates.map((template) => (
          <div key={template.nome} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-950">{template.nome}</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                {template.status}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{template.descricao}</p>
          </div>
        ))}
      </div>
    </aside>
  )
}
