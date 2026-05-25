import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  Eye,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react'

function LogoMark() {
  return (
    <div className="select-none">
      <div className="flex items-end gap-2">
        <span className="text-[3.25rem] font-black leading-none tracking-[0.22em] text-[#004b63] md:text-[4.2rem]">
          GKLI
        </span>
      </div>
      <div className="mt-1 flex justify-center text-[0.74rem] font-semibold uppercase tracking-[1.05em] text-[#004b63] md:text-[0.92rem]">
        Cobrança
      </div>
    </div>
  )
}

function FloatingDiamond({
  className,
  color,
}: {
  className: string
  color: string
}) {
  return (
    <div
      className={`absolute rotate-45 rounded-[1.35rem] shadow-sm ${className}`}
      style={{ backgroundColor: color }}
    />
  )
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#d7eef5] bg-white/75 text-[#004b63] shadow-sm backdrop-blur">
        {icon}
      </div>
      <div>
        <strong className="block text-sm font-semibold text-[#004b63]">
          {title}
        </strong>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          {description}
        </p>
      </div>
    </div>
  )
}

export function GKLIloginPage({ errorMessage }: { errorMessage?: string }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f7f6] text-slate-900">
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-8 bg-[#004b63] xl:block" />

      <div className="pointer-events-none absolute -left-32 top-[-120px] h-[420px] w-[420px] rotate-45 rounded-[4rem] bg-[#9bc7c3]" />
      <div className="pointer-events-none absolute -bottom-52 -left-44 h-[520px] w-[520px] rotate-45 rounded-[5.5rem] bg-[#004b63]" />
      <div className="pointer-events-none absolute left-[-42px] top-[250px] h-24 w-24 rounded-full bg-[#004b63]" />

      <FloatingDiamond className="left-[120px] top-[38px] h-28 w-28 md:left-[160px] md:top-[24px] md:h-36 md:w-36" color="#ffc20a" />
      <FloatingDiamond className="bottom-[120px] left-[70px] h-16 w-16" color="#a6cfd0" />
      <FloatingDiamond className="bottom-[110px] left-[42%] hidden h-24 w-24 lg:block" color="#ffc20a" />
      <FloatingDiamond className="bottom-[92px] left-[35%] hidden h-14 w-14 lg:block" color="#a8e6bd" />

      <section className="relative z-10 grid min-h-screen grid-cols-1 gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] lg:px-10 xl:px-16">
        <div className="relative hidden min-h-[620px] items-center justify-center lg:flex">
          <div className="relative h-[520px] w-[520px] rotate-45 rounded-[4.5rem] bg-[#004b63] p-7 shadow-2xl xl:h-[620px] xl:w-[620px]">
            <div className="h-full w-full rounded-[3.7rem] bg-[#a6cfd0] p-3">
              <div className="relative h-full w-full overflow-hidden rounded-[3.1rem] bg-slate-200">
                <Image
                  src="/gkli/gkli-login-reference.png"
                  alt="GKLI Cobrança"
                  fill
                  priority
                  className="-rotate-45 scale-[1.44] object-cover"
                  sizes="620px"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-black/5 via-transparent to-black/20" />
              </div>
            </div>
          </div>

          <div className="absolute bottom-3 left-14 right-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
            <FeatureItem
              icon={<ShieldCheck size={22} />}
              title="Segurança"
              description="Ambiente protegido para dados sensíveis."
            />
            <FeatureItem
              icon={<TrendingUp size={22} />}
              title="Resultado"
              description="Operação orientada a performance."
            />
            <FeatureItem
              icon={<Zap size={22} />}
              title="Agilidade"
              description="Menos cliques na rotina diária."
            />
            <FeatureItem
              icon={<Sparkles size={22} />}
              title="Foco"
              description="Atenção no que realmente importa."
            />
          </div>
        </div>

        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center py-8">
          <div className="w-full max-w-[520px]">
            <div className="rounded-[2.25rem] border border-white/80 bg-white/82 p-7 shadow-2xl shadow-slate-300/60 backdrop-blur-xl md:p-10">
              <div className="flex justify-center">
                <LogoMark />
              </div>

              <div className="mt-10">
                <h1 className="text-3xl font-light leading-tight tracking-tight text-[#19364a] md:text-[2.35rem]">
                  Inteligência que{' '}
                  <span className="font-extrabold text-[#004b63]">
                    conecta.
                  </span>
                  <br />
                  Resultados que{' '}
                  <span className="font-extrabold text-[#004b63]">
                    transformam.
                  </span>
                </h1>

                <p className="mt-5 max-w-md text-sm leading-6 text-slate-500">
                  Bem-vindo à plataforma completa de gestão e recuperação condominial.
                </p>
              </div>

              {errorMessage ? (
                <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              <form className="mt-8 space-y-4" action="/auth/login" method="post">
                <label className="group flex h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-[#004b63] focus-within:ring-4 focus-within:ring-[#d7eef5]">
                  <Mail size={19} className="text-slate-400 transition group-focus-within:text-[#004b63]" />
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="E-mail ou usuário"
                    className="h-full flex-1 bg-transparent text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400"
                  />
                </label>

                <label className="group flex h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-[#004b63] focus-within:ring-4 focus-within:ring-[#d7eef5]">
                  <Lock size={19} className="text-slate-400 transition group-focus-within:text-[#004b63]" />
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Senha"
                    className="h-full flex-1 bg-transparent text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400"
                  />
                  <Eye size={18} className="text-slate-400" />
                </label>

                <div className="flex items-center justify-between gap-4 text-sm">
                  <label className="flex items-center gap-2 text-slate-600">
                    <input
                      type="checkbox"
                      name="remember"
                      className="h-4 w-4 rounded border-slate-300 text-[#004b63]"
                    />
                    Lembrar-me
                  </label>

                  <Link
                    href="/recuperar-senha"
                    className="font-semibold text-[#006f95] hover:text-[#004b63]"
                  >
                    Esqueci minha senha
                  </Link>
                </div>

                <button
                  type="submit"
                  className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#004b63] px-5 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-lg shadow-[#004b63]/20 transition hover:-translate-y-0.5 hover:bg-[#00617f] hover:shadow-xl"
                >
                  Entrar
                  <ArrowRight size={18} className="transition group-hover:translate-x-1" />
                </button>
              </form>

              <div className="mt-7 flex items-center gap-4 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                ambiente seguro
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50">
                  <span className="text-lg font-black text-[#4285f4]">G</span>
                  Google
                </button>
                <button className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50">
                  <span className="grid grid-cols-2 gap-0.5">
                    <span className="h-2 w-2 bg-[#f25022]" />
                    <span className="h-2 w-2 bg-[#7fba00]" />
                    <span className="h-2 w-2 bg-[#00a4ef]" />
                    <span className="h-2 w-2 bg-[#ffb900]" />
                  </span>
                  Microsoft
                </button>
              </div>
            </div>

            <div className="mt-7 text-center text-xs text-slate-500">
              <p className="inline-flex items-center gap-2">
                <Lock size={14} />
                Ambiente seguro e criptografado
              </p>
              <p className="mt-3">© 2026 GKLI Cobrança. Todos os direitos reservados.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
