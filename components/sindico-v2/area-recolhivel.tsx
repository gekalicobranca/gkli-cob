'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, ChartNoAxesCombined } from 'lucide-react'

export function AreaRecolhivel({ titulo, descricao, numero, resumo, dashboard, children }: {
  titulo: string; descricao: string; numero: string; resumo: string; dashboard: ReactNode; children: ReactNode
}) {
  const id = useId()
  const [aberta, setAberta] = useState(true)
  const [graficoAberto, setGraficoAberto] = useState(true)
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <h2>
        <button type="button" aria-expanded={aberta} aria-controls={`${id}-area`}
          onClick={() => setAberta(!aberta)}
          className="flex w-full items-center gap-4 p-5 text-left focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-cyan-700 sm:p-6">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-sm font-semibold text-cyan-800">{numero}</span>
          <span className="min-w-0 flex-1"><span className="block text-lg font-semibold text-slate-900">{titulo}</span>
            <span className="mt-1 block text-sm font-normal text-slate-500">{descricao}</span>
            <span className="mt-1 block text-xs font-normal text-slate-500 sm:hidden">{resumo}</span></span>
          <span className="hidden text-xs font-normal text-slate-500 sm:block">{resumo}</span>
          <ChevronDown aria-hidden="true" className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${aberta ? 'rotate-180' : ''}`} />
        </button>
      </h2>
      <div id={`${id}-area`} hidden={!aberta}>
        <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
          <button type="button" aria-expanded={graficoAberto} aria-controls={`${id}-dashboard`}
            onClick={() => setGraficoAberto(!graficoAberto)}
            className="flex min-h-10 items-center gap-2 rounded text-sm font-medium text-slate-600 focus-visible:outline-2 focus-visible:outline-cyan-700">
            <ChartNoAxesCombined aria-hidden="true" className="h-4 w-4" />
            {graficoAberto ? 'Recolher indicadores' : 'Mostrar indicadores'}
            <span className="sr-only"> de {titulo}</span>
            <ChevronDown aria-hidden="true" className={`h-4 w-4 ${graficoAberto ? 'rotate-180' : ''}`} />
          </button>
          <div id={`${id}-dashboard`} hidden={!graficoAberto} className="pt-3">{dashboard}</div>
        </div>
        <div className="border-t border-slate-100 p-5 sm:p-6">{children}</div>
      </div>
    </section>
  )
}
