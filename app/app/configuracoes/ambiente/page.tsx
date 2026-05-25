export default function AmbientePage() {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#04799a]">Configurações</span>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Chaves e ambiente</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
        Área reservada para parâmetros técnicos. Nesta Sprint C1 ela fica preparada, sem expor ou editar segredos pelo front-end.
      </p>
    </div>
  )
}
