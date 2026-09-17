'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function MaestroRefresh({ ativo }: { ativo: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!ativo) return
    const timer = setInterval(() => router.refresh(), 30000)
    return () => clearInterval(timer)
  }, [ativo, router])
  return null
}
