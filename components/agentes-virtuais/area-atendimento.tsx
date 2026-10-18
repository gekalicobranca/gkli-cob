'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { ListCollapsibleSectionHeader } from '@/components/layout/list-page'

export function AreaAtendimento({ id, titulo, resumo, aberta = false, recolherAoSelecionar = false, children }: {
  id?: string; titulo: string; resumo?: ReactNode; aberta?: boolean; recolherAoSelecionar?: boolean; children: ReactNode
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    // Links do roteiro também precisam abrir uma área que foi recolhida.
    const revelar = (hash = window.location.hash.slice(1)) => {
      const target = hash ? document.getElementById(hash) : null
      if (target && ref.current?.contains(target)) {
        ref.current.open = true
        target.scrollIntoView({ block: 'start' })
      }
    }
    revelar()
    const mudouHash = () => revelar()
    const clicouLink = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
      if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const url = new URL(link.href, window.location.href)
      if (recolherAoSelecionar && ref.current?.contains(link) && url.origin === window.location.origin && url.pathname === window.location.pathname && url.searchParams.has('caso')) ref.current.open = false
      if (url.pathname === window.location.pathname && url.search === window.location.search) revelar(url.hash.slice(1))
    }
    window.addEventListener('hashchange', mudouHash)
    document.addEventListener('click', clicouLink)
    return () => { window.removeEventListener('hashchange', mudouHash); document.removeEventListener('click', clicouLink) }
  }, [recolherAoSelecionar])
  return <details ref={ref} id={id} open={aberta} className="group scroll-mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <summary className="cursor-pointer list-none focus-visible:outline-2 focus-visible:outline-cyan-700 [&::-webkit-details-marker]:hidden">
      <ListCollapsibleSectionHeader title={titulo} count={resumo} />
    </summary>
    <div className="space-y-4 p-4 sm:p-5">{children}</div>
  </details>
}

export function FocoAtendimento({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Links para uma etapa específica mantêm seu destino original.
    if (window.location.hash && window.location.hash !== '#detalhes-caso') return
    const frame = window.requestAnimationFrame(() => {
      ref.current?.focus({ preventScroll: true })
      ref.current?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])
  return <div ref={ref} id="detalhes-caso" tabIndex={-1} aria-label="Atendimento selecionado" className="scroll-mt-4 space-y-4 outline-none">{children}</div>
}
