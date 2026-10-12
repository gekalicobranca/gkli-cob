'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Clock3, Play, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { solicitarPdfs } from './actions'

export function ResgatarPdfs({ ids, disabled = false, plural = false, emFila = false }: { ids: string[]; disabled?: boolean; plural?: boolean; emFila?: boolean }) {
  const [pending, start] = useTransition()
  const [resultado, setResultado] = useState<{ mensagem: string; erro?: boolean } | null>(null)
  const router = useRouter()
  return <div className="flex flex-col items-start gap-2">
    <Button type="button" size="sm" variant="secondary" disabled={disabled || emFila || !ids.length} loading={pending} loadingLabel="Solicitando..." onClick={() => start(async () => {
      try { setResultado(await solicitarPdfs(ids)); router.refresh() }
      catch { setResultado({ mensagem: 'A solicitação falhou. Tente novamente.', erro: true }) }
    })}>{emFila ? <Clock3 className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{emFila ? 'Execução na fila / em andamento' : plural ? 'Executar filtrados agora' : 'Executar agora'}</Button>
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
  return <Button type="button" variant="header" onClick={() => router.refresh()}><RefreshCw className="h-3.5 w-3.5" />Atualizar</Button>
}
