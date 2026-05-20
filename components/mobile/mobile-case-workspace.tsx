import { ArrowLeft, MessageCircle, Phone, Send, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { MobileBottomActions } from '@/components/mobile/mobile-bottom-actions'
import { MobileCaseDrawer } from '@/components/mobile/mobile-case-drawer'

export function MobileCaseWorkspace() {
  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <Link href="/app/mobile" className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
            <ArrowLeft size={18} />
          </Link>

          <div className="text-center">
            <h1 className="text-sm font-semibold text-slate-950">Workspace Mobile</h1>
            <p className="text-xs text-slate-500">Atendimento rápido</p>
          </div>

          <button className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#04799a] text-white">
            <Sparkles size={18} />
          </button>
        </div>
      </header>

      <main className="space-y-4 p-4">
        <MobileCaseDrawer />

        <section className="rounded-[2rem] border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Ações rápidas</h2>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button className="rounded-2xl border px-3 py-4 text-sm font-semibold text-slate-700">
              <Phone className="mx-auto mb-2" size={18} />
              Ligar
            </button>

            <button className="rounded-2xl border px-3 py-4 text-sm font-semibold text-slate-700">
              <MessageCircle className="mx-auto mb-2" size={18} />
              WhatsApp
            </button>

            <button className="rounded-2xl border px-3 py-4 text-sm font-semibold text-slate-700">
              <Send className="mx-auto mb-2" size={18} />
              Enviar
            </button>
          </div>
        </section>

        <section className="rounded-[2rem] border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Histórico resumido</h2>

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
              Mensagem enviada ontem às 18:12.
            </div>
            <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
              Proposta de acordo visualizada.
            </div>
            <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
              Próximo retorno recomendado para hoje.
            </div>
          </div>
        </section>
      </main>

      <MobileBottomActions />
    </div>
  )
}
