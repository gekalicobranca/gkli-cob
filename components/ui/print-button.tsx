'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PrintButton({ label = 'Imprimir' }: { label?: string }) {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      <Printer size={16} />
      {label}
    </Button>
  )
}
