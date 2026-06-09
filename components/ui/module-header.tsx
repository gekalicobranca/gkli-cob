import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type HeaderVariant = 'default' | 'compact' | 'subtle'

type ModuleHeaderProps = {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  action?: ReactNode
  compact?: boolean
  children?: ReactNode
  className?: string
  variant?: HeaderVariant
}

export function ModuleHeader({
  eyebrow = 'GKLI Cobrança',
  title,
  description,
  actions,
  action,
  compact = false,
  children,
  className,
  variant = 'default',
}: ModuleHeaderProps) {
  const resolvedCompact = compact || variant === 'compact'
  const resolvedActions = actions ?? action
  const isSubtle = variant === 'subtle'

  return (
    <section
      className={cn(
        'gkli-page-header relative overflow-hidden rounded-[22px] border shadow-[0_16px_42px_-34px_rgba(15,23,42,.50)]',
        isSubtle
          ? 'border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50 text-slate-950'
          : 'border-white/10 bg-[linear-gradient(135deg,#03658C_0%,#025170_56%,#073044_100%)] text-white',
        resolvedCompact ? 'p-4' : 'p-4 md:p-5',
        className,
      )}
    >
      {!isSubtle ? (
        <>
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-32 rounded-full bg-cyan-200/10 blur-2xl" />
        </>
      ) : null}

      <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <p
            className={cn(
              'text-[11px] font-semibold uppercase tracking-[0.26em]',
              isSubtle ? 'text-slate-400' : 'text-white/62',
            )}
          >
            {eyebrow}
          </p>

          <h1
            className={cn(
              'mt-2 text-xl font-semibold leading-tight tracking-[-0.025em] md:text-2xl',
              isSubtle ? 'text-slate-950' : 'text-white',
            )}
          >
            {title}
          </h1>

          {description ? (
            <p
              className={cn(
                'mt-1 max-w-2xl text-[13px] leading-5',
                isSubtle ? 'text-slate-500' : 'text-white/78',
              )}
            >
              {description}
            </p>
          ) : null}
        </div>

        {resolvedActions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {resolvedActions}
          </div>
        ) : null}
      </div>

      {children ? <div className="relative z-10 mt-4">{children}</div> : null}
    </section>
  )
}

export function ModuleSubHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm leading-5 text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}
