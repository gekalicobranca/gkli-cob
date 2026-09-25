'use client'

import { useEffect, useId, useState } from 'react'
import { ListFilterField } from '@/components/layout/list-page'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import type { FlowCondominioOption } from '@/features/flows/cobranca/queries'

const label = (row: FlowCondominioOption) => row.nome_operacional || row.nome

export function FlowScopeFilters({ carteiras, condominios, carteiraId = '', condominioId = '' }: {
  carteiras: Array<{ id: string; nome: string }>
  condominios: FlowCondominioOption[]
  carteiraId?: string
  condominioId?: string
}) {
  const initial = condominios.find(row => row.id === condominioId)
  const [carteira, setCarteira] = useState(carteiraId)
  const [selected, setSelected] = useState(initial)
  const [term, setTerm] = useState(initial ? label(initial) : '')
  const [options, setOptions] = useState<FlowCondominioOption[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const listId = useId()
  useEffect(() => {
    if (selected || term.trim().length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/flows/cobranca/condominios?${new URLSearchParams({ q: term, carteira })}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) })
        if (!response.ok) throw new Error()
        const data = await response.json()
        if (!controller.signal.aborted) { setOptions(data.rows ?? []); setSearched(true) }
      } catch {
        if (!controller.signal.aborted) setError('Não foi possível buscar. Digite novamente para tentar.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [term, carteira, selected])

  return <>
    <ListFilterField label="Carteira" className="xl:col-span-2">
      <Select name="carteira" value={carteira} onChange={event => {
        setCarteira(event.target.value)
        setSelected(undefined)
        setTerm('')
        setOptions([])
        setLoading(false)
        setSearched(false)
        setError('')
        ;(document.getElementById(listId) as HTMLInputElement | null)?.setCustomValidity('')
      }}><option value="">Todas</option>{carteiras.map(row => <option key={row.id} value={row.id}>{row.nome}</option>)}</Select>
    </ListFilterField>
    <div className="xl:col-span-2">
      <label htmlFor={listId} className="text-xs font-medium uppercase text-slate-400">Condomínio</label>
      <Input id={listId} value={term} autoComplete="off" placeholder="Digite ao menos 2 letras e selecione" aria-controls={`${listId}-options`} onChange={event => {
        setTerm(event.target.value)
        setSelected(undefined)
        setOptions([])
        setLoading(false)
        setSearched(false)
        setError('')
        event.target.setCustomValidity(event.target.value.trim() ? 'Selecione um condomínio nos resultados ou limpe a busca.' : '')
      }} />
      <input type="hidden" name="condominio" value={selected?.id ?? ''} />
      <div id={`${listId}-options`} className="max-h-48 overflow-y-auto">
        {!selected && options.map(row => <button key={row.id} type="button" className="block w-full border-b border-slate-100 px-2 py-2 text-left text-sm hover:bg-slate-50" onClick={() => {
          setSelected(row)
          setTerm(label(row))
          setOptions([])
          setLoading(false)
          ;(document.getElementById(listId) as HTMLInputElement | null)?.setCustomValidity('')
        }}>{label(row)}</button>)}
      </div>
      {loading ? <p role="status" className="text-xs text-slate-500">Buscando…</p> : null}
      {!selected && searched && !loading && !options.length && !error ? <p role="status" className="text-xs text-slate-500">Nenhum condomínio encontrado.</p> : null}
      {options.length === 30 ? <p className="text-xs text-slate-500">Digite mais letras para refinar os resultados.</p> : null}
      {error ? <p role="alert" className="text-xs text-rose-700">{error}</p> : null}
    </div>
  </>
}
