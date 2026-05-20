import Link from 'next/link'
import { Settings } from 'lucide-react'

export function SettingsTopButton() {
  return (
    <Link
      href="/app/configuracoes"
      className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-sm transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
      title="Configurações"
      aria-label="Abrir configurações"
    >
      <Settings size={18} />
    </Link>
  )
}
