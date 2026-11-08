export default function EasyLoading() {
  return <div role="status" className="mx-auto max-w-5xl space-y-5 p-2">
    <p className="text-xs font-semibold uppercase tracking-[.2em] text-cyan-700">Easy Cob · Carregando a operação…</p>
    <div aria-hidden="true" className="space-y-5 animate-pulse motion-reduce:animate-none"><div className="h-32 rounded-3xl bg-slate-200/60" /><div className="grid gap-4 sm:grid-cols-2"><div className="h-24 rounded-2xl bg-slate-100" /><div className="h-24 rounded-2xl bg-slate-100" /></div><div className="h-48 rounded-3xl bg-white" /></div>
  </div>;
}
