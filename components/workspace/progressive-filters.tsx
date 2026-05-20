
export function ProgressiveFilters() {
  return (
    <div className="rounded-3xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <strong className="text-sm">
          Filtros rápidos
        </strong>

        <button className="text-sm text-[#04799a]">
          Modo avançado
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="rounded-xl border px-3 py-2 text-sm">
          Alta prioridade
        </button>

        <button className="rounded-xl border px-3 py-2 text-sm">
          Hoje
        </button>

        <button className="rounded-xl border px-3 py-2 text-sm">
          Sem retorno
        </button>
      </div>
    </div>
  )
}
