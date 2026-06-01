
export default function FocusWorkspacePage() {
  return (
    <div className="grid h-full grid-cols-[320px_minmax(0,1fr)_360px] gap-4">
      <aside className="rounded-3xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Fila Operacional</h2>
        <p className="mt-2 text-sm text-slate-500">
          Casos prioritários do operador.
        </p>
      </aside>

      <main className="rounded-3xl border bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              Workspace de Negociação
            </h1>
            <p className="text-sm text-slate-500">
              Atendimento centralizado sem troca de tela.
            </p>
          </div>
        </div>

        <section className="mt-6 space-y-4">
          <div className="rounded-2xl border bg-slate-50 p-4">
            Timeline resumida inteligente
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            Histórico operacional
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            Painel de negociação
          </div>
        </section>
      </main>

      <aside className="rounded-3xl border bg-white p-4">
        <h2 className="text-lg font-semibold">
          IA Operacional
        </h2>

        <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
          Próxima melhor ação:
          <strong className="block mt-2">
            Oferecer acordo com entrada reduzida.
          </strong>
        </div>
      </aside>
    </div>
  )
}
