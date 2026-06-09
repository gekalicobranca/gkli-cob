import { ButtonLink } from '@/components/ui/button'
import { Home, Search } from 'lucide-react'

export default function AppNotFound() {
  return (
    <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-4 py-10">
      <section className="w-full max-w-[720px] rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm md:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-[var(--gkli-primary)] ring-1 ring-sky-100">
          <Search className="h-6 w-6" aria-hidden="true" />
        </div>

        <h1 className="mt-5 text-xl font-semibold text-slate-950 md:text-2xl">Página não encontrada</h1>
        <p className="mx-auto mt-3 max-w-[560px] text-sm leading-6 text-slate-600">
          O endereço acessado não corresponde a nenhum módulo disponível. Volte ao painel para continuar a operação.
        </p>

        <div className="mt-6 flex justify-center">
          <ButtonLink href="/app" variant="secondary">
            <Home className="h-4 w-4" aria-hidden="true" />
            Ir para o painel
          </ButtonLink>
        </div>
      </section>
    </main>
  )
}
