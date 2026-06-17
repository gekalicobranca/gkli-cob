'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

type ReguaActionButtonProps = React.ComponentProps<typeof Button> & {
  confirmMessage?: string
  pendingLabel?: string
}

export function ReguaActionButton({
  children,
  confirmMessage,
  pendingLabel,
  onClick,
  ...props
}: ReguaActionButtonProps) {
  const [pending, setPending] = useState(false)

  return (
    <Button
      {...props}
      loading={pending}
      loadingLabel={pendingLabel}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault()
          return
        }

        setPending(true)
        onClick?.(event)
      }}
    >
      {children}
    </Button>
  )
}
