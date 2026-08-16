'use client'

import { Trash2 } from 'lucide-react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'

export function LimparExecucoesButton({ total }: { total: number }) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      variant="danger"
      loading={pending}
      loadingLabel="Limpando..."
      disabled={!total}
      onClick={(event) => {
        if (!window.confirm(`Limpar ${total} execução(ões) da lista? Os registros da agenda serão preservados para evitar duplicidades.`)) {
          event.preventDefault()
        }
      }}
    >
      <Trash2 size={15} /> Limpar
    </Button>
  )
}
