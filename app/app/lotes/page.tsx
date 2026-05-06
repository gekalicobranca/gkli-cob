import Link from "next/link"

export default function LotesPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">
          Base Operacional
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Lotes
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Área reservada para histórico e acompanhamento dos lotes da régua.
        </p>
      </section>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Controle de execução</h2>
        <p className="mt-2 text-sm text-slate-600">
          Enquanto o painel dedicado evolui, a geração e o acompanhamento ficam em Mensageria.
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
