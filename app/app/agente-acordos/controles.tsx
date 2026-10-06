'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { solicitarPdfs } from './actions'

export function ResgatarPdfs({ ids, disabled = false, plural = false }: { ids: string[]; disabled?: boolean; plural?: boolean }) {
  const [pending, start] = useTransition()
  const [resultado, setResultado] = useState<{ mensagem: string; erro?: boolean } | null>(null)
  const router = useRouter()
  return <div className="flex flex-col items-start gap-2">
    <Button size="sm" variant="secondary" disabled={disabled || !ids.length} loading={pending} loadingLabel="Solicitando..." onClick={() => start(async () => {
      try { setResultado(await solicitarPdfs(ids)); router.refresh() }
      catch { setResultado({ mensagem: 'A solicitação falhou. Tente novamente.', erro: true }) }
    })}><Download className="h-3.5 w-3.5" />{plural ? 'Resgatar filtrados' : 'Resgatar PDF'}</Button>
    {resultado && <p role="status" className={`max-w-sm text-xs ${resultado.erro ? 'text-red-700' : 'text-emerald-700'}`}>{resultado.mensagem}</p>}
  </div>
}

export function AtualizarFila({ ativa }: { ativa: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!ativa) return
    const timer = setInterval(() => { if (document.visibilityState === 'visible') router.refresh() }, 5000)
    return () => clearInterval(timer)
  }, [ativa, router])
  return <Button variant="secondary" size="sm" onClick={() => router.refresh()}><RefreshCw className="h-3.5 w-3.5" />Atualizar</Button>
}
