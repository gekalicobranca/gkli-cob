import { cn } from '@/lib/utils'

type ListPageShellProps = {
  filters?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function ListPageShell({ filters, actions, children, className }: ListPageShellProps) {
  return (
    <section className={cn('gkli-list-shell', className)}>
      {(filters || actions) ? (
        <div className="gkli-filter-bar">
          <div className="min-w-0 flex-1">{filters}</div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}
