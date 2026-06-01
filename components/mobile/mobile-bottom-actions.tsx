import Link from 'next/link'
import { CalendarClock, MessageCircle, Phone, Plus } from 'lucide-react'

export function MobileBottomActions() {
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 rounded-[1.75rem] border border-slate-200 bg-white/95 p-2 shadow-2xl backdrop-blur md:hidden">
      <div className="grid grid-cols-4 gap-1">
        <Link
          href="/app/inbox"
          className="flex flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          <MessageCircle size={18} />
          Inbox
        </Link>

        <Link
          href="/app/agenda"
          className="flex flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          <CalendarClock size={18} />
          Agenda
        </Link>

        <button className="flex flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
          <Phone size={18} />
          Contato
        </button>

        <button className="flex flex-col items-center justify-center rounded-2xl bg-[#04799a] px-2 py-2 text-[11px] font-semibold text-white">
          <Plus size={18} />
          Ação
        </button>
      </div>
    </nav>
  )
}
