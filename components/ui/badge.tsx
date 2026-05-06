import { cn } from '@/lib/utils'

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: 'slate' | 'green' | 'yellow' | 'red' | 'blue' | 'indigo' | 'primary'
}

const tones: Record<NonNullable<BadgeProps['tone']>, string> = {
  slate: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700',
  yellow: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  blue: 'bg-blue-50 text-blue-700',
  indigo: 'bg-indigo-50 text-indigo-700',
  primary: 'bg-[var(--gkli-primary-light)] text-[var(--gkli-primary)]',
}

export function Badge({ className, tone = 'slate', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        tones[tone],
        className
      )}
      {...props}
    />
  )
}
