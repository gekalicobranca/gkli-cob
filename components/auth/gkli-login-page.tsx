import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Eye, Lock, Mail } from 'lucide-react'

export function GKLIloginPage({ errorMessage }: { errorMessage?: string }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f4f5f7]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,75,99,0.08),transparent_32%)]" />

      <div className="absolute left-0 top-0 hidden h-full w-[45%] overflow-hidden lg:block">
        <div className="absolute inset-0 opacity-[0.05] [background-image:radial-gradient(#004b63_0.7px,transparent_0.7px)] [background-size:24px_24px]" />
      </div>

      <section className="relative z-10 grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_560px]">
        <div className="hidden items-center justify-center px-16 lg:flex">
          <div className="max-w-[540px]">
            <Image
              src="/logo-gkit-tecnologia-aplicada.png"
              alt="GKIT Tecnologia Aplicada"
              width={760}
              height={300}
              priority
              className="h-auto w-full"
            />

            <div className="mt-10 max-w-[440px]">
              <h1 className="text-4xl font-light leading-tight text-[#19364a]">
                Plataforma inteligente para
                <span className="font-bold text-[#004b63]"> gestão de cobrança.</span>
              </h1>

              <p className="mt-5 text-base leading-7 text-slate-500">
                Operação, acompanhamento e performance em um único ambiente.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center px-6 py-10 lg:px-10">
          <div className="w-full max-w-[520px] rounded-[2rem] border border-white/70 bg-white/90 p-8 shadow-[0_25px_80px_rgba(15,23,42,0.10)] backdrop-blur md:p-10">
            <div className="flex justify-center lg:hidden">
              <Image
                src="/logo-gkit-tecnologia-aplicada.png"
                alt="GKIT Tecnologia Aplicada"
                width={320}
                height={126}
                priority
                className="h-auto w-[320px]"
              />
            </div>

            <div className="mt-2 text-center lg:text-left">
              <h2 className="text-4xl font-bold tracking-tight text-[#004b63]">
                Bem-vindo(a)!
              </h2>

              <p className="mt-3 text-lg text-slate-500">
                Acesse sua conta para continuar.
              </p>
            </div>

            {errorMessage ? (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <form className="mt-10 space-y-5" action="/auth/login" method="post">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Usuário
                </label>

                <label className="group flex h-16 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 transition focus-within:border-[#004b63] focus-within:ring-4 focus-within:ring-[#d8edf4]">
                  <Mail size={20} className="text-slate-400 group-focus-within:text-[#004b63]" />

                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="Digite seu usuário"
                    className="h-full flex-1 bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </label>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Senha
                </label>

                <label className="group flex h-16 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 transition focus-within:border-[#004b63] focus-within:ring-4 focus-within:ring-[#d8edf4]">
                  <Lock size={20} className="text-slate-400 group-focus-within:text-[#004b63]" />

                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Digite sua senha"
                    className="h-full flex-1 bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-400"
                  />

                  <Eye size={20} className="text-slate-400" />
                </label>
              </div>

              <div className="flex justify-end">
                <Link
                  href="/recuperar-senha"
                  className="text-sm font-medium text-[#005f7c] transition hover:text-[#004b63]"
                >
                  Esqueci minha senha
                </Link>
              </div>

              <button
                type="submit"
                className="group flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-[#004b63] text-lg font-semibold text-white transition hover:bg-[#005f7c]"
              >
                Entrar
                <ArrowRight size={20} className="transition group-hover:translate-x-1" />
              </button>
            </form>

            <div className="mt-8 text-center text-sm text-slate-400">
              © 2026 GKIT Tecnologia Aplicada
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
