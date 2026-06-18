import { cn } from '@/lib/utils'

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--gkli-primary)] focus:ring-2 focus:ring-[var(--gkli-primary)]/20',
        className
      )}
      {...props}
    />
  )
}
