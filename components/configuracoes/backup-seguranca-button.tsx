'use client'

import { useState } from 'react'
import { Download, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function BackupSegurancaButton() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function exportBackup() {
    if (!window.confirm('O arquivo contém dados confidenciais. Deseja continuar?')) return
    setLoading(true)
    setMessage(null)
    try {
      const response = await fetch('/api/backup/exportar', { cache: 'no-store' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Não foi possível gerar o backup.')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const disposition = response.headers.get('content-disposition')
      const name = disposition?.match(/filename="([^"]+)"/)?.[1] ?? 'gkli-backup.zip'
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = name
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setMessage('Pacote gerado. Guarde-o em um cofre criptografado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro inesperado ao exportar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" onClick={exportBackup} loading={loading} loadingLabel="Preparando pacote...">
        <Download size={16} />
        Exportar dados e esquema
      </Button>
      {message ? (
        <p className="flex items-start gap-2 text-sm leading-6 text-slate-600" role="status">
          <ShieldAlert className="mt-1 h-4 w-4 shrink-0 text-amber-600" />
          {message}
        </p>
      ) : null}
    </div>
  )
}
