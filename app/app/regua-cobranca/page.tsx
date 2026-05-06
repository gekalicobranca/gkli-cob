import Link from "next/link"

export default function ReguaCobrancaPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">
          Base Operacional
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Régua de Cobrança
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Configure e acompanhe as regras de entrada na régua por condomínio.
          A operação de geração de lote segue centralizada em Mensageria.
        </p>
      </section>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Atalho operacional</h2>
        <p className="mt-2 text-sm text-slate-600">
          Use Mensageria para gerar lotes e acompanhar execuções.
        </p>
        <Link
          href="/app/mensageria"
          className="mt-4 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Ir para Mensageria
        </Link>
      </div>
    </div>
  )
}
