'use client'

import { Button } from '@/components/ui/button'

type ReguaActionButtonProps = React.ComponentProps<typeof Button> & {
  confirmMessage?: string
}

export function ReguaActionButton({
  children,
  confirmMessage,
  onClick,
  ...props
}: ReguaActionButtonProps) {
  return (
    <Button
      {...props}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault()
          return
        }

        onClick?.(event)
      }}
    >
      {children}
    </Button>
  )
}
