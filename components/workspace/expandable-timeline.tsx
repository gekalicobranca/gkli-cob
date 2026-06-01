
export function ExpandableTimeline() {
  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Timeline expandível
        </h2>

        <button className="text-sm text-[#04799a]">
          Ver completo
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-2xl bg-slate-50 p-4">
          Último contato realizado
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          Mensagem enviada
        </div>
      </div>
    </div>
  )
}
