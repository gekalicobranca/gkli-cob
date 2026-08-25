import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, KeyRound, Lock } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'

export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams?: Promise<{ erro?: string }>
}) {
  const params = searchParams ? await searchParams : undefined
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const invalidLink = Boolean(params?.erro) || !user

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f5f7] px-5 py-10 text-slate-900">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,75,99,0.08),transparent_32%)]" />
      <div className="absolute inset-0 opacity-[0.04] [background-image:radial-gradient(#004b63_0.7px,transparent_0.7px)] [background-size:24px_24px]" />

      <section className="relative z-10 w-full max-w-[520px] rounded-[2rem] border border-white/70 bg-white/90 p-8 shadow-[0_25px_80px_rgba(15,23,42,0.10)] backdrop-blur md:p-10">
        <div className="flex justify-center">
          <Image
            src="/logo-gkli-cobranca-inteligente.png"
            alt="GKLI Cobrança Inteligente"
            width={320}
            height={126}
            priority
            className="h-auto w-[280px] sm:w-[320px]"
          />
        </div>

        <div className="mt-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#e4f3f8] text-[#004b63]">
            <KeyRound size={22} />
          </span>

          <h1 className="mt-5 text-3xl font-bold tracking-tight text-[#004b63]">
            Redefinir senha
          </h1>

          <p className="mt-3 text-base leading-7 text-slate-500">
            Crie uma nova senha para voltar a acessar a plataforma GKLI.
          </p>
        </div>

        {invalidLink ? (
          <>
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">
              {params?.erro ?? 'Link inválido ou expirado. Solicite uma nova recuperação de senha.'}
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Link
                href="/recuperar-senha"
                className="inline-flex h-14 items-center justify-center rounded-2xl bg-[#004b63] px-5 text-sm font-semibold text-white shadow-lg shadow-[#004b63]/20 transition hover:bg-[#005f7c]"
              >
                Solicitar novo link
              </Link>

              <Link
                href="/login"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-[#d7e8ee] bg-white px-5 text-sm font-semibold text-[#005f7c] transition hover:bg-[#f5fafc]"
              >
                <ArrowLeft size={16} />
                Voltar ao login
              </Link>
            </div>
          </>
        ) : (
          <form className="mt-8 space-y-5" action="/auth/redefinir-senha" method="post">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Nova senha
              </label>

              <label className="group flex h-16 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 transition focus-within:border-[#004b63] focus-within:ring-4 focus-within:ring-[#d8edf4]">
                <Lock size={20} className="text-slate-400 group-focus-within:text-[#004b63]" />

                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  placeholder="Mínimo de 8 caracteres"
                  className="h-full min-w-0 flex-1 bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-400"
                />
              </label>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Confirmar nova senha
              </label>

              <label className="group flex h-16 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 transition focus-within:border-[#004b63] focus-within:ring-4 focus-within:ring-[#d8edf4]">
                <Lock size={20} className="text-slate-400 group-focus-within:text-[#004b63]" />

                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  placeholder="Repita a nova senha"
                  className="h-full min-w-0 flex-1 bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-400"
                />
              </label>
            </div>

            <button
              type="submit"
              className="flex h-16 w-full items-center justify-center rounded-2xl bg-[#004b63] px-5 text-base font-semibold text-white shadow-lg shadow-[#004b63]/20 transition hover:bg-[#005f7c]"
            >
              Atualizar senha
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
