import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'

export function KpiCard({ label, value, hint, description, icon }: { label: string; value: string | number; hint?: string; description?: string; icon?: ReactNode }) {
  const text = hint ?? description
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase text-slate-400">{label}</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p>
          {text ? <p className="mt-1 text-sm leading-5 text-slate-500">{text}</p> : null}
        </div>
        {icon ? <div className="rounded-lg bg-[var(--gkli-primary-soft)] p-2 text-[var(--gkli-primary)]">{icon}</div> : null}
      </div>
    </Card>
  )
}
