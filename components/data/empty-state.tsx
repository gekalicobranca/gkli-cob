import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'

type EmptyStateAction = {
  href: string
  label: string
}

type EmptyStateProps = {
  title: string
  description: string
  action?: EmptyStateAction
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Card className="py-10 text-center">
      <p className="text-base font-medium text-slate-950">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>

      {action ? (
        <div className="mt-5 flex justify-center">
          <ButtonLink href={action.href} variant="secondary">
            {action.label}
          </ButtonLink>
        </div>
      ) : null}
    </Card>
  )
}
