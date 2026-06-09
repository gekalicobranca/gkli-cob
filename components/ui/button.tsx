import Link from 'next/link'
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'header'
type ButtonSize = 'sm' | 'md'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  loadingLabel?: string
}
type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize; className?: string; children: ReactNode }

const variants: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-[var(--gkli-primary)] !text-white hover:bg-[var(--gkli-primary-hover)] [&_svg]:!text-white',
  secondary: 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
  ghost: 'border-transparent bg-transparent text-slate-600 shadow-none hover:bg-slate-100 hover:text-slate-950',
  danger: 'border-transparent bg-rose-600 !text-white hover:bg-rose-700 [&_svg]:!text-white',
  header: 'border-white/25 bg-white/10 !text-white hover:bg-white/16 [&_svg]:!text-white'
}
const sizes: Record<ButtonSize, string> = { sm: 'h-8 px-2.5 text-[12px]', md: 'h-9 px-3.5 text-[13px]' }
const base = 'inline-flex items-center justify-center gap-2 rounded-lg border font-medium tracking-[-0.005em] shadow-sm transition duration-150 active:translate-y-px active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gkli-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0 disabled:active:scale-100 [&_svg]:shrink-0'

export function Button({ children, className, disabled, loading = false, loadingLabel, variant = 'primary', size = 'md', ...props }: ButtonProps) {
  const safeVariant: ButtonVariant = variant
  const safeSize: ButtonSize = size
  return (
    <button
      data-interactive
      data-variant={variant}
      data-size={size}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(base, variants[safeVariant], sizes[safeSize], className)}
      {...props}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  )
}

export function ButtonLink({ className, variant = 'primary', size = 'md', ...props }: ButtonLinkProps) {
  const safeVariant: ButtonVariant = variant
  const safeSize: ButtonSize = size
  return <Link data-interactive data-variant={variant} data-size={size} className={cn(base, variants[safeVariant], sizes[safeSize], className)} {...props} />
}
