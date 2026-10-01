'use client'

import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function MaestroRefresh({ ativo }: { ativo: boolean }) {
  const router = useRouter()
  const [updating, startRefresh] = useTransition()
  useEffect(() => {
    if (!ativo) return
    if (updating) return
    const timer = setTimeout(() => {
      if (document.visibilityState === 'hidden') return
      startRefresh(() => router.refresh())
    }, 30000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') startRefresh(() => router.refresh())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [ativo, router, updating])
  return null
}
