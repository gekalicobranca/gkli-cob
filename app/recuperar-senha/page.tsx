import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Mail } from 'lucide-react'

export default async function RecuperarSenhaPage({
  searchParams,
}: {
  searchParams?: Promise<{ erro?: string; enviado?: string }>
}) {
  const params = searchParams ? await searchParams : undefined
  const emailSent = params?.enviado === '1'

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f5f7] px-5 py-10 text-slate-900">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,75,99,0.08),transparent_32%)]" />
      <div className="absolute inset-0 opacity-[0.04] [background-image:radial-gradient(#004b63_0.7px,transparent_0.7px)] [background-size:24px_24px]" />

      <section className="relative z-10 w-full max-w-[520px] rounded-[2rem] border border-white/70 bg-white/90 p-8 shadow-[0_25px_80px_rgba(15,23,42,0.10)] backdrop-blur md:p-10">
        <div className="flex flex-col items-center">
          <Image
            src="/logo-gkli-mark.png"
            alt="GKLI"
            width={96}
            height={96}
            priority
            className="h-24 w-24 rounded-[1.5rem] object-cover shadow-[0_16px_40px_rgba(0,75,99,0.16)]"
          />
          <p className="mt-4 text-center text-2xl font-bold tracking-tight text-[#004b63]">
            Tecnologia com estilo
          </p>
          <p className="mt-1 text-sm font-semibold uppercase tracking-[0.18em] text-[#19364a]">
            GKLI Cobrança
          </p>
        </div>

        <div className="mt-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-[#004b63]">
            Recuperar senha
          </h1>

          <p className="mt-3 text-base leading-7 text-slate-500">
            Informe o e-mail cadastrado. Se ele existir na base, enviaremos um link seguro para redefinir sua senha.
          </p>
        </div>

        {params?.erro ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {params.erro}
          </div>
        ) : null}

        {emailSent ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            Se o e-mail estiver cadastrado, o link de redefinição chegará em instantes. Confira também a caixa de spam.
          </div>
        ) : null}

        <form className="mt-8 space-y-5" action="/auth/recuperar-senha" method="post">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              E-mail
            </label>

            <label className="group flex h-16 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 transition focus-within:border-[#004b63] focus-within:ring-4 focus-within:ring-[#d8edf4]">
              <Mail size={20} className="text-slate-400 group-focus-within:text-[#004b63]" />

              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="seuemail@empresa.com"
                required
                className="h-full min-w-0 flex-1 bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>
          </div>

          <button
            type="submit"
            className="flex h-16 w-full items-center justify-center rounded-2xl bg-[#004b63] px-5 text-base font-semibold text-white shadow-lg shadow-[#004b63]/20 transition hover:bg-[#005f7c]"
          >
            Enviar link de redefinição
          </button>
        </form>

        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#005f7c] transition hover:text-[#004b63]"
        >
          <ArrowLeft size={16} />
          Voltar ao login
        </Link>
      </section>
    </main>
  )
}
