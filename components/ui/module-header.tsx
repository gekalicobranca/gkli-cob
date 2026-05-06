import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function ModuleHeader({ eyebrow = 'GKLI Cobrança', title, description, actions, action, compact = false, children, className, variant }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode; action?: ReactNode; compact?: boolean; children?: ReactNode; className?: string; variant?: 'default' | 'compact' }) {
  const resolvedCompact = compact || variant === 'compact'
  const resolvedActions = actions ?? action
  return (
    <section className={cn('gkli-page-header overflow-hidden rounded-3xl border border-white/10 text-white shadow-[0_22px_60px_-38px_rgba(15,23,42,.65)]', resolvedCompact ? 'p-5' : 'p-6 md:p-7', className)} style={{ background: 'linear-gradient(135deg, var(--gkli-primary) 0%, var(--gkli-primary-hover) 100%)' }}>
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/60">{eyebrow}</p>
          <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.03em] md:text-[28px]">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">{description}</p> : null}
        </div>
        {resolvedActions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{resolvedActions}</div> : null}
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  )
}

export function ModuleSubHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}
