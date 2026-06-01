
export function SmartCase() {
  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
      <aside className="rounded-[2rem] border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">
          Contexto rápido
        </h2>

        <div className="mt-4 space-y-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            Cobrança ativa
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            Acordo vinculado
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            Pendências abertas
          </div>
        </div>
      </aside>

      <main className="space-y-5">
        <section className="rounded-[2rem] border bg-white p-6 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#04799a]">
            Smart Case
          </span>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
            Workspace operacional unificado
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Cobrança, acordo, timeline e inteligência operacional passam a funcionar
            em um único fluxo contínuo.
          </p>
        </section>

        <section className="rounded-[2rem] border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">
            Timeline inteligente
          </h2>

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border bg-slate-50 p-4">
              Último contato realizado
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              Proposta enviada
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              Promessa de pagamento
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">
            Ações rápidas
          </h2>

          <div className="mt-4 flex flex-wrap gap-3">
            <button className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white">
              Registrar contato
            </button>

            <button className="rounded-2xl border px-4 py-3 text-sm font-medium">
              Gerar acordo
            </button>

            <button className="rounded-2xl border px-4 py-3 text-sm font-medium">
              Reagendar retorno
            </button>
          </div>
        </section>
      </main>

      <aside className="space-y-5">
        <section className="rounded-[2rem] border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">
            IA contextual
          </h2>

          <div className="mt-4 rounded-2xl bg-[#f5fbfd] p-4 text-sm leading-6">
            Alta chance de acordo com entrada reduzida.
          </div>

          <div className="mt-3 rounded-2xl bg-[#f5fbfd] p-4 text-sm leading-6">
            Melhor horário de contato: após 18h.
          </div>
        </section>

        <section className="rounded-[2rem] border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">
            Próxima melhor ação
          </h2>

          <p className="mt-4 text-sm leading-6 text-slate-600">
            Retomar negociação antes do vencimento da promessa.
          </p>
        </section>
      </aside>
    </div>
  )
}
