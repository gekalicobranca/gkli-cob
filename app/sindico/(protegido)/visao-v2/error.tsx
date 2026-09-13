'use client'

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6">
    <h1 className="text-xl font-semibold">Não foi possível carregar esta visão</h1>
    <p className="mt-3 text-sm text-slate-600">Tente novamente. Se o problema continuar, fale com a equipe GKLI.</p>
    <button onClick={reset} className="mt-5 rounded-lg bg-cyan-800 px-4 py-3 text-sm font-semibold text-white">Tentar novamente</button>
  </div></main>
}
