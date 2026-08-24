import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function KpiCard({
  label,
  value,
  hint,
  description,
  icon,
  badge,
  className,
  valueClassName,
}: {
  label: string
  value: string | number
  hint?: string
  description?: string
  icon?: ReactNode
  badge?: ReactNode
  className?: string
  valueClassName?: string
}) {
  const text = hint ?? description
  return (
    <Card className={cn('p-3', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-normal text-slate-400">{label}</p>
          <p className={cn('mt-1.5 text-2xl font-semibold text-slate-950', valueClassName)}>{value}</p>
          {text ? <p className="mt-1 text-sm leading-5 text-slate-500">{text}</p> : null}
        </div>
        {badge ?? (icon ? <div className="rounded-lg bg-[var(--gkli-primary-soft)] p-2 text-[var(--gkli-primary)]">{icon}</div> : null)}
      </div>
    </Card>
  )
}
