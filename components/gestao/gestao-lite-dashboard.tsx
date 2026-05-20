
export function GestaoLiteDashboard() {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border bg-white p-6 shadow-sm">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#04799a]">
          Gestão Lite
        </span>

        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
          Visão executiva simplificada
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          O GKLI-Cob Lite separa definitivamente operação e gestão.
          Esta área é focada em performance, produtividade e indicadores estratégicos.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Recuperação
          </span>

          <strong className="mt-3 block text-4xl font-semibold text-slate-950">
            R$ 428k
          </strong>

          <p className="mt-2 text-sm text-emerald-600">
            +18% este mês
          </p>
        </div>

        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Conversão
          </span>

          <strong className="mt-3 block text-4xl font-semibold text-slate-950">
            42%
          </strong>

          <p className="mt-2 text-sm text-sky-600">
            Acima da meta
          </p>
        </div>

        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
            SLA
          </span>

          <strong className="mt-3 block text-4xl font-semibold text-slate-950">
            1.8d
          </strong>

          <p className="mt-2 text-sm text-amber-600">
            Tempo médio operacional
          </p>
        </div>

        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Acordos
          </span>

          <strong className="mt-3 block text-4xl font-semibold text-slate-950">
            128
          </strong>

          <p className="mt-2 text-sm text-emerald-600">
            92% ativos
          </p>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-[2rem] border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">
            Performance operacional
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Ranking simplificado da equipe.
          </p>

          <div className="mt-6 space-y-4">
            {[
              ['Juliana', 'R$ 98k', '41 acordos'],
              ['Marcelo', 'R$ 81k', '36 acordos'],
              ['Fernanda', 'R$ 72k', '28 acordos'],
            ].map(([name, value, meta]) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-2xl border bg-slate-50 p-4"
              >
                <div>
                  <strong className="block text-sm text-slate-950">
                    {name}
                  </strong>

                  <span className="text-sm text-slate-500">
                    {meta}
                  </span>
                </div>

                <strong className="text-lg text-slate-950">
                  {value}
                </strong>
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-[2rem] border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              Carteiras
            </h2>

            <div className="mt-5 space-y-3">
              {[
                ['GKLI Prime', '92%'],
                ['Residencial Sul', '84%'],
                ['Alpha Carteira', '79%'],
              ].map(([name, value]) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"
                >
                  <span className="text-sm font-medium text-slate-700">
                    {name}
                  </span>

                  <strong className="text-slate-950">
                    {value}
                  </strong>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              Filosofia Lite
            </h2>

            <p className="mt-4 text-sm leading-6 text-slate-600">
              Gestão não deve competir visualmente com a operação.
              Esta camada reduz densidade visual e prioriza leitura rápida.
            </p>
          </div>
        </aside>
      </section>
    </div>
  )
}
