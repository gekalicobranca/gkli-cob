import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type LitePageShellProps = {
  children: ReactNode
  className?: string
}

export function LitePageShell({ children, className }: LitePageShellProps) {
  return (
    <div className={cn('gkli-viewport-page flex h-full min-h-0 flex-col gap-4 overflow-hidden', className)}>
      {children}
    </div>
  )
}

export function LitePageHeader({ children, className }: LitePageShellProps) {
  return (
    <section className={cn('gkli-viewport-header shrink-0', className)}>
      {children}
    </section>
  )
}

export function LiteKpiStrip({ children, className }: LitePageShellProps) {
  return (
    <section className={cn('gkli-viewport-kpis shrink-0', className)}>
      {children}
    </section>
  )
}

export function LiteWorkArea({ children, className }: LitePageShellProps) {
  return (
    <section className={cn('gkli-viewport-workarea min-h-0 flex-1 overflow-hidden', className)}>
      {children}
    </section>
  )
}

export function LiteScrollArea({ children, className }: LitePageShellProps) {
  return (
    <div className={cn('gkli-scrollbar min-h-0 overflow-y-auto overscroll-contain', className)}>
      {children}
    </div>
  )
}
