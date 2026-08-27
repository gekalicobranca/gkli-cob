import type { FormHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
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

type ListMetricProps = {
  label: string
  value: ReactNode
  icon?: ReactNode
  className?: string
  valueClassName?: string
}

type ListPaginationProps = {
  page: number
  pageSize: number
  total: number
  previousHref?: string
  nextHref?: string
}

type ListCollapsibleFiltersProps = {
  children: ReactNode
  defaultOpen?: boolean
  label?: string
  actions?: ReactNode
}

type ListCollapsibleSectionHeaderProps = {
  title: string
  count?: ReactNode
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
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
    </div>
  )
}

export function ListCollapsibleFilters({
  children,
  defaultOpen = false,
  label = 'Filtros',
  actions,
}: ListCollapsibleFiltersProps) {
  return (
    <ListPanel>
      <details open={defaultOpen} className="group bg-white">
        <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <ListPanelHeader className="flex items-center justify-between gap-3 bg-white/80 py-2.5 group-hover:bg-slate-50">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <ChevronDown size={17} className="text-slate-400 transition-transform group-open:rotate-180" />
              {label}
            </div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
          </ListPanelHeader>
        </summary>
        <div className="px-4 pb-3">
          {children}
        </div>
      </details>
    </ListPanel>
  )
}

export function ListCollapsibleSectionHeader({ title, count }: ListCollapsibleSectionHeaderProps) {
  return (
    <ListPanelHeader className="flex items-center justify-between gap-3 bg-white/80 py-2.5 group-hover:bg-slate-50">
      <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-950">
        <ChevronDown size={17} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
        <span className="truncate">{title}</span>
      </div>
      {count !== undefined ? (
        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
          {count}
        </span>
      ) : null}
    </ListPanelHeader>
  )
}

export function ListFiltersForm({ className, children, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form
      className={cn(
        'mt-3 grid min-w-0 gap-3 xl:items-end [&>div]:min-w-0 [&>label]:min-w-0 [&_button]:whitespace-nowrap [&_input]:min-w-0 [&_input]:text-[13px] [&_select]:min-w-0 [&_select]:text-[13px]',
        className
      )}
      {...props}
    >
      {children}
    </form>
  )
}

export function ListFilterField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn('min-w-0 space-y-1.5', className)}>
      <span className="text-xs font-medium uppercase tracking-normal text-slate-400">{label}</span>
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

export function ListItemTitle({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('truncate text-sm font-medium text-slate-950', className)} {...props}>
      {children}
    </p>
  )
}

export function ListItemMeta({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('mt-1 truncate text-xs leading-5 text-slate-500', className)} {...props}>
      {children}
    </p>
  )
}

export function ListMetric({ label, value, icon, className, valueClassName }: ListMetricProps) {
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-normal text-slate-400">{label}</p>
      <p className={cn('mt-1 flex items-center gap-1.5 text-sm font-medium text-slate-700', valueClassName)}>
        {icon}
        {value}
      </p>
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

export function ListPagination({ page, pageSize, total, previousHref, nextHref }: ListPaginationProps) {
  if (total <= pageSize && page <= 1) return null

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(Math.max(page, 1), totalPages)
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const end = Math.min(total, currentPage * pageSize)

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
      <span>
        Exibindo {start}-{end} de {total}
      </span>
      <div className="flex items-center gap-2">
        <ButtonLink
          href={previousHref ?? '#'}
          variant="secondary"
          size="sm"
          className={!previousHref ? 'pointer-events-none opacity-45' : undefined}
        >
          <ChevronLeft size={15} />
          Anterior
        </ButtonLink>
        <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
          {currentPage} / {totalPages}
        </span>
        <ButtonLink
          href={nextHref ?? '#'}
          variant="secondary"
          size="sm"
          className={!nextHref ? 'pointer-events-none opacity-45' : undefined}
        >
          Próxima
          <ChevronRight size={15} />
        </ButtonLink>
      </div>
    </div>
  )
}
