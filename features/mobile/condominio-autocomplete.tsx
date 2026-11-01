'use client'

import { useId, useState } from 'react'

type Option = { id: string; nome: string }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')

export function CondominioAutocomplete({ options, value, onChange }: { options: Option[]; value: string; onChange: (id: string) => void }) {
  const id = useId()
  const [query, setQuery] = useState(options.find(option => option.id === value)?.nome ?? '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const matches = options.filter(option => normalize(option.nome).includes(normalize(query)))
  const suggestions = matches.slice(0, 15)
  function choose(option: Option) { setQuery(option.nome); onChange(option.id); setOpen(false); setActive(-1) }
  return <div className="relative space-y-2" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <label htmlFor={id} className="block text-sm font-semibold">Condomínio</label>
    <input id={id} type="text" role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open}
      aria-controls={`${id}-suggestions`} aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
      placeholder="Digite o nome do condomínio…" value={query}
      className="min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900"
      onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); onChange(''); setOpen(true); setActive(-1) }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true)
          setActive(current => !suggestions.length ? -1 : current < 0 ? (event.key === 'ArrowDown' ? 0 : suggestions.length - 1) : (current + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length)
        }
        if (event.key === 'Escape') { setOpen(false); setActive(-1) }
        if (event.key === 'Enter' && open) { event.preventDefault(); if (suggestions[active >= 0 ? active : 0]) choose(suggestions[active >= 0 ? active : 0]) }
      }} />
    {open && <div className="absolute z-20 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
      <ul id={`${id}-suggestions`} role="listbox" aria-label="Condomínios encontrados">
        {suggestions.map((option, index) => <li key={option.id} id={`${id}-${index}`} role="option" aria-selected={active === index || option.id === value}
          onPointerDown={event => event.preventDefault()} onClick={() => choose(option)}
          className={`cursor-pointer break-words border-b border-slate-100 px-4 py-4 text-sm ${active === index ? 'bg-cyan-50 text-cyan-900' : 'hover:bg-slate-50'}`}>{option.nome}</li>)}
      </ul>
      {!matches.length && <p role="status" className="p-4 text-sm text-slate-600">Nenhum condomínio encontrado.</p>}
      {matches.length > 15 && <p className="p-3 text-xs text-slate-500">Digite mais para refinar os {matches.length} resultados.</p>}
    </div>}
    {value && !open && <p className="text-xs text-emerald-700">Condomínio selecionado.</p>}
  </div>
}
