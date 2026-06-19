import type { FormHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { EmptyState } from '@/components/data/empty-state'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ButtonLink } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type BaseProps<T extends HTMLElement = HTMLDivElement> = HTMLAttributes<T> & {
  children: ReactNode
}

type ListSearchFieldProps = {
  name?: string
  defaultValue?: string
  placeholder: string
  label?: string
  className?: string
}

type ClearFiltersLinkProps = {
  href: string
  show?: boolean
  label?: string
}

type ListEmptyStateProps = {
  title: string
  description: string
}

export function ListPage({ className, children, ...props }: BaseProps) {
  return (
    <div className={cn('space-y-3', className)} {...props}>
      {children}
    </div>
  )
}

export function ListKpiGrid({ className, children, ...props }: BaseProps) {
  return (
    <section className={cn('grid gap-2 md:grid-cols-2 xl:grid-cols-4', className)} {...props}>
      {children}
    </section>
  )
}

export function ListPanel({ className, children, ...props }: BaseProps) {
  return (
    <Card className={cn('overflow-hidden p-0', className)} {...props}>
      {children}
    </Card>
  )
}

export function ListPanelHeader({ className, children, ...props }: BaseProps) {
  return (
    <div className={cn('border-b border-slate-100 px-4 py-3', className)} {...props}>
      {children}
    </div>
  )
}

export function ListTitleBar({ className, children, ...props }: BaseProps) {
  return (
    <div className={cn('flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between', className)} {...props}>
      {children}
    </div>
  )
}

export function ListTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="text-base font-medium text-slate-950">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
    </div>
  )
}

export function ListFiltersForm({ className, children, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form className={cn('mt-3 grid min-w-0 gap-3 xl:items-end', className)} {...props}>
      {children}
    </form>
  )
}

export function ListFilterField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn('min-w-0 space-y-1.5', className)}>
      <span className="text-xs font-medium uppercase text-slate-400">{label}</span>
      {children}
    </label>
  )
}

export function ListSearchField({ name = 'q', defaultValue, placeholder, label = 'Busca', className }: ListSearchFieldProps) {
  return (
    <ListFilterField label={label} className={className}>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input name={name} className="pl-9" placeholder={placeholder} defaultValue={defaultValue ?? ''} />
      </div>
    </ListFilterField>
  )
}

export function ClearFiltersLink({ href, show = true, label = 'Limpar filtros' }: ClearFiltersLinkProps) {
  if (!show) return null
  return (
    <ButtonLink href={href} variant="secondary" size="sm">
      <X size={15} />
      {label}
    </ButtonLink>
  )
}

export function ListRows({ className, children, ...props }: BaseProps) {
  return (
    <div className={cn('divide-y divide-slate-100', className)} {...props}>
      {children}
    </div>
  )
}

export function ListRow({ className, children, ...props }: BaseProps) {
  return (
    <div className={cn('grid gap-3 px-4 py-3 transition hover:bg-slate-50 xl:items-center', className)} {...props}>
      {children}
    </div>
  )
}

export function ListEmptyState({ title, description }: ListEmptyStateProps) {
  return (
    <div className="p-3">
      <EmptyState title={title} description={description} />
    </div>
  )
}
