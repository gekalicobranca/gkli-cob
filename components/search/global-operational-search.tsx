'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

type SearchResult = {
  id: string
  type: 'condominio' | 'unidade' | 'cobranca' | 'acordo'
  title: string
  subtitle: string
  href: string
  status?: string | null
  meta?: string | null
}

type SearchResponse = {
  query: string
  total: number
  results: SearchResult[]
}

const TYPE_LABELS: Record<SearchResult['type'], string> = {
  condominio: 'Condomínios',
  unidade: 'Unidades',
  cobranca: 'Cobranças',
  acordo: 'Acordos',
}

const TYPE_ICONS: Record<SearchResult['type'], string> = {
  condominio: '▣',
  unidade: '□',
  cobranca: '$',
  acordo: '↔',
}

function groupResults(results: SearchResult[]) {
  return results.reduce<Record<SearchResult['type'], SearchResult[]>>((acc, result) => {
    acc[result.type] = [...(acc[result.type] ?? []), result]
    return acc
  }, { condominio: [], unidade: [], cobranca: [], acordo: [] })
}

function getRecentSearches(): SearchResult[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem('gkli:cobranca:recent-search-results:v1') ?? '[]')
    return Array.isArray(parsed) ? parsed.slice(0, 6) : []
  } catch {
    return []
  }
}

function saveRecentResult(result: SearchResult) {
  if (typeof window === 'undefined') return
  const current = getRecentSearches().filter((item) => item.href !== result.href)
  const next = [result, ...current].slice(0, 6)
  window.localStorage.setItem('gkli:cobranca:recent-search-results:v1', JSON.stringify(next))
}

export function GlobalOperationalSearch() {
  const router = useRouter()
  const pathname = usePathname()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [recent, setRecent] = useState<SearchResult[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  const trimmedQuery = query.trim()
  const grouped = useMemo(() => groupResults(results), [results])
  const visibleResults = trimmedQuery.length >= 2 ? results : recent

  useEffect(() => {
    setRecent(getRecentSearches())
  }, [])

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const isCommandSearch = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
      if (!isCommandSearch) return
      event.preventDefault()
      setOpen(true)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    setOpen(false)
    setQuery('')
    setResults([])
  }, [pathname])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!open) return
      if (panelRef.current?.contains(event.target as Node)) return
      if (inputRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }

    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (trimmedQuery.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/busca-global?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Falha ao buscar')
        const payload = (await response.json()) as SearchResponse
        setResults(payload.results ?? [])
        setActiveIndex(0)
      } catch {
        if (!controller.signal.aborted) setResults([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 260)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [trimmedQuery])

  function goToResult(result: SearchResult) {
    saveRecentResult(result)
    setRecent(getRecentSearches())
    setOpen(false)
    setQuery('')
    router.push(result.href)
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      inputRef.current?.blur()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, Math.max(visibleResults.length - 1, 0)))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }

    if (event.key === 'Enter') {
      const selected = visibleResults[activeIndex]
      if (!selected && trimmedQuery.length >= 2) {
        router.push(`/app/busca?q=${encodeURIComponent(trimmedQuery)}`)
        setOpen(false)
        return
      }
      if (selected) {
        event.preventDefault()
        goToResult(selected)
      }
    }
  }

  return (
    <div className="relative min-w-0 flex-1" ref={panelRef}>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">⌕</span>
        <input
          ref={inputRef}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onKeyDown={onInputKeyDown}
          className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50/80 pl-10 pr-24 text-sm font-medium text-slate-800 outline-none ring-0 transition placeholder:text-slate-400 hover:border-slate-300 hover:bg-white focus:border-[#04799a]/35 focus:bg-white focus:shadow-sm focus:ring-4 focus:ring-[#04799a]/10"
          placeholder="Buscar condomínio, unidade, cobrança, acordo..."
          aria-label="Busca operacional global"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-xl border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-400 shadow-sm md:inline-flex">
          Ctrl K
        </span>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-[3.25rem] z-50 overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Busca operacional
              </p>
              <Link
                href={trimmedQuery.length >= 2 ? `/app/busca?q=${encodeURIComponent(trimmedQuery)}` : '/app/busca'}
                onClick={() => setOpen(false)}
                className="rounded-xl px-2 py-1 text-xs font-medium text-[#04799a] transition hover:bg-[#edf8fb]"
              >
                busca completa
              </Link>
            </div>
          </div>

          {trimmedQuery.length < 2 ? (
            <div className="max-h-[62vh] overflow-y-auto p-2">
              {recent.length > 0 ? (
                <ResultList title="Recentes" results={recent} activeIndex={activeIndex} offset={0} onSelect={goToResult} />
              ) : (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm font-medium text-slate-700">Digite pelo menos 2 caracteres.</p>
                  <p className="mt-1 text-xs text-slate-500">A busca encontra condomínios, unidades, cobranças e acordos com tolerância a acentos, números parciais e contexto operacional.</p>
                </div>
              )}
            </div>
          ) : loading ? (
            <div className="p-4">
              <div className="space-y-2">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            </div>
          ) : results.length > 0 ? (
            <div className="max-h-[62vh] overflow-y-auto p-2">
              {(Object.keys(TYPE_LABELS) as SearchResult['type'][]).map((type) => {
                const items = grouped[type]
                if (!items.length) return null
                const offset = results.findIndex((result) => result.type === type)
                return (
                  <ResultList
                    key={type}
                    title={TYPE_LABELS[type]}
                    results={items}
                    activeIndex={activeIndex}
                    offset={offset}
                    onSelect={goToResult}
                  />
                )
              })}
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-700">Nenhum resultado encontrado.</p>
              <p className="mt-1 text-xs text-slate-500">Tente unidade, nome operacional, CNPJ/CPF parcial, telefone ou status.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ResultList({
  title,
  results,
  activeIndex,
  offset,
  onSelect,
}: {
  title: string
  results: SearchResult[]
  activeIndex: number
  offset: number
  onSelect: (result: SearchResult) => void
}) {
  return (
    <section className="py-1">
      <h3 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</h3>
      <div className="space-y-1">
        {results.map((result, index) => {
          const active = activeIndex === offset + index
          return (
            <button
              key={`${result.type}-${result.id}`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(result)}
              className={[
                'flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition',
                active ? 'bg-[#edf8fb] ring-1 ring-[#ccebf3]' : 'hover:bg-slate-50',
              ].join(' ')}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-500">
                {TYPE_ICONS[result.type]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-950">{result.title}</span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">{result.subtitle}</span>
              </span>
              {result.status ? (
                <span className="hidden shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 sm:inline-flex">
                  {result.status}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
