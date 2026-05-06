const templates = [
  {
    nome: "Conectcon",
    status: "Disponível na V1",
    descricao: "XLS/HTML em linhas diretas: unidade, nome, vencimento, referência e valor.",
  },
  {
    nome: "Condopro",
    status: "Próxima fase",
    descricao: "XLS/HTML por blocos de unidade, recibos e total geral da unidade.",
  },
  {
    nome: "Manager / Webware",
    status: "Próxima fase",
    descricao: "PDF estruturado com blocos por unidade e totais por recibo.",
  },
  {
    nome: "Superlógica",
    status: "A mapear",
    descricao: "Será incluído após amostras reais de exportação.",
  },
]

export function RecognizedTemplatesCard() {
  return (
    <aside className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
        Templates reconhecidos
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">Origens suportadas</h2>

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
