'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0
}

function getInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  return target.closest('button, a, input[type="submit"], input[type="button"], [role="button"], [data-interactive]')
}

function getInternalLink(target: Element) {
  const link = target.closest('a[href]')
  if (!(link instanceof HTMLAnchorElement)) return null
  if (link.target && link.target !== '_self') return null

  try {
    const url = new URL(link.href, window.location.href)
    if (url.origin !== window.location.origin) return null
    if (`${url.pathname}${url.search}` === `${window.location.pathname}${window.location.search}`) return null
    return url
  } catch {
    return null
  }
}

export function AppInteractionIndicator() {
  const pathname = usePathname()
  const [pulse, setPulse] = useState(false)
  const [busy, setBusy] = useState(false)
  const [label, setLabel] = useState('Processando...')
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busyDelayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busyMaxTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearBusyTimers = useCallback(() => {
    if (busyDelayTimer.current) clearTimeout(busyDelayTimer.current)
    if (busyMaxTimer.current) clearTimeout(busyMaxTimer.current)
    busyDelayTimer.current = null
    busyMaxTimer.current = null
  }, [])

  const stopBusy = useCallback(() => {
    clearBusyTimers()
    setBusy(false)
  }, [clearBusyTimers])

  const flashClick = useCallback(() => {
    if (pulseTimer.current) clearTimeout(pulseTimer.current)
    setPulse(true)
    pulseTimer.current = setTimeout(() => setPulse(false), 180)
  }, [])

  const startBusy = useCallback((nextLabel: string) => {
    clearBusyTimers()
    setLabel(nextLabel)
    busyDelayTimer.current = setTimeout(() => setBusy(true), 260)
    busyMaxTimer.current = setTimeout(() => setBusy(false), 9000)
  }, [clearBusyTimers])

  useEffect(() => {
    stopBusy()
    setPulse(false)
    return undefined
  }, [pathname, stopBusy])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = getInteractiveTarget(event.target)
      if (!target || target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true') return
      flashClick()
    }

    function onClick(event: MouseEvent) {
      if (isModifiedClick(event)) return
      const target = getInteractiveTarget(event.target)
      if (!target || target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true') return

      const link = getInternalLink(target)
      if (link) startBusy('Carregando...')
    }

    function onSubmit(event: SubmitEvent) {
      if (!(event.target instanceof HTMLFormElement)) return
      if (event.defaultPrevented || event.target.dataset.globalPending === 'off') return
      startBusy(event.target.dataset.pendingLabel || 'Salvando...')
    }

    window.addEventListener('pointerdown', onPointerDown, { capture: true })
    window.addEventListener('click', onClick, { capture: true })
    window.addEventListener('submit', onSubmit, { capture: true })
    window.addEventListener('pageshow', stopBusy)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true })
      window.removeEventListener('click', onClick, { capture: true })
      window.removeEventListener('submit', onSubmit, { capture: true })
      window.removeEventListener('pageshow', stopBusy)
      if (pulseTimer.current) clearTimeout(pulseTimer.current)
      clearBusyTimers()
    }
  }, [clearBusyTimers, flashClick, startBusy, stopBusy])

  return (
    <>
      <div
        aria-hidden="true"
        className={[
          'pointer-events-none fixed left-0 right-0 top-0 z-[100] h-1 origin-left bg-[var(--gkli-primary)] transition-opacity duration-150',
          busy ? 'opacity-100' : pulse ? 'opacity-60' : 'opacity-0',
          busy ? 'animate-[gkli-progress_1.1s_ease-in-out_infinite]' : 'scale-x-100',
        ].join(' ')}
      />

      <div className="pointer-events-none fixed bottom-4 right-4 z-[100]">
        <div
          role="status"
          aria-live="polite"
          className={[
            'flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-lg transition duration-150',
            busy ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
          ].join(' ')}
        >
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-200 border-t-[var(--gkli-primary)]" />
          {label}
        </div>
      </div>
    </>
  )
}
