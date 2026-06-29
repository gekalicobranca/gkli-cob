import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Lock, Mail, ShieldCheck } from "lucide-react";

export default async function SindicoLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ erro?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f4f5f7]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,75,99,0.08),transparent_32%)]" />

      <section className="relative z-10 grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_520px]">
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

            <div className="mt-10 max-w-[460px]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#04799a]">
                Portal do sindico
              </p>
              <h1 className="mt-4 text-4xl font-light leading-tight text-[#19364a]">
                Acompanhe seus condominios com
                <span className="font-bold text-[#004b63]"> acesso restrito e seguro.</span>
              </h1>
              <p className="mt-5 text-base leading-7 text-slate-500">
                Consulte acordos, pendencias e informacoes permitidas pela operacao GKLI.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center px-6 py-10 lg:px-10">
          <div className="w-full max-w-[500px] rounded-[2rem] border border-white/70 bg-white/90 p-8 shadow-[0_25px_80px_rgba(15,23,42,0.10)] backdrop-blur md:p-10">
            <div className="flex justify-center lg:hidden">
              <Image
                src="/logo-gkit-tecnologia-aplicada.png"
                alt="GKIT Tecnologia Aplicada"
                width={300}
                height={118}
                priority
                className="h-auto w-[300px]"
              />
            </div>

            <div className="mt-2 text-center lg:text-left">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#e4f3f8] text-[#004b63] lg:mx-0">
                <ShieldCheck size={22} />
              </span>
              <h2 className="mt-5 text-3xl font-bold tracking-tight text-[#004b63]">
                Acesso do sindico
              </h2>
              <p className="mt-3 text-base text-slate-500">
                Entre com o e-mail liberado pela equipe GKLI.
              </p>
            </div>

            {params?.erro ? (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {params.erro}
              </div>
            ) : null}

            <form className="mt-8 space-y-5" action="/auth/sindico-login" method="post">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">E-mail</label>
                <label className="group flex h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 transition focus-within:border-[#004b63] focus-within:ring-4 focus-within:ring-[#d8edf4]">
                  <Mail size={18} className="text-slate-400 group-focus-within:text-[#004b63]" />
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="sindico@email.com"
                    className="h-full flex-1 bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </label>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Senha</label>
                <label className="group flex h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 transition focus-within:border-[#004b63] focus-within:ring-4 focus-within:ring-[#d8edf4]">
                  <Lock size={18} className="text-slate-400 group-focus-within:text-[#004b63]" />
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Digite sua senha"
                    className="h-full flex-1 bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </label>
              </div>

              <button
                type="submit"
                className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#004b63] text-base font-semibold text-white transition hover:bg-[#005f7c]"
              >
                Entrar no portal
                <ArrowRight size={18} className="transition group-hover:translate-x-1" />
              </button>
            </form>

            <div className="mt-6 flex flex-wrap justify-between gap-3 text-sm">
              <Link href="/recuperar-senha" className="font-medium text-[#005f7c] transition hover:text-[#004b63]">
                Esqueci minha senha
              </Link>
              <Link href="/login" className="font-medium text-slate-500 transition hover:text-[#004b63]">
                Acesso interno
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
