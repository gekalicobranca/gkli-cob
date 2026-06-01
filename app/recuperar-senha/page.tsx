import Link from 'next/link'

export default function RecuperarSenhaPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7f6] px-5 py-10 text-slate-900">
      <section className="w-full max-w-lg rounded-[2rem] border border-white/80 bg-white p-8 shadow-2xl shadow-slate-300/50">
        <div className="mb-6 inline-flex rounded-full border border-[#d7eef5] bg-[#edf8fb] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#04799a]">
          GKLI Cobrança
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-[#004b63]">
          Recuperação de senha
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          A recuperação automática ainda não está habilitada neste ambiente. Solicite ao administrador a redefinição da senha no Supabase/Auth.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#004b63] px-5 text-sm font-semibold text-white shadow-lg shadow-[#004b63]/20 transition hover:-translate-y-0.5 hover:bg-[#00617f]"
          >
            Voltar ao login
          </Link>
        </div>
      </section>
    </main>
  )
}
