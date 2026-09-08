'use client'

import { useState } from 'react'
import type { PeriodoSindico } from '@/features/sindico-v2/periodos'

export function FiltrosSindico({ condominios, selecionado, periodo, ultima, action = '/sindico/visao-v2' }: {
  condominios: { id: string; nome: string }[]; selecionado?: string; periodo: PeriodoSindico; ultima: string; action?: string
}) {
  const [modo, setModo] = useState(periodo.modo)
  const field = 'mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-2 focus:outline-cyan-700'
  return (
    <form action={action} method="get" className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end">
      <label className="text-sm font-medium text-slate-700">Condomínio
        <select name="condominio" required defaultValue={selecionado ?? ''} className={field}>
          <option value="" disabled>Selecione um condomínio</option>
          {condominios.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Visualização
        <select name="modo" value={modo} onChange={(event) => setModo(event.target.value as PeriodoSindico['modo'])} className={field}>
          <option value="mensal">Competência mensal</option><option value="anual">Agrupado do ano</option>
        </select>
      </label>
      {modo === 'mensal' ? (
        <label key="mensal" className="text-sm font-medium text-slate-700">Competência de encerramento
          <input type="month" name="competencia" required min="1900-01" max={ultima} defaultValue={periodo.competencia} className={field} />
        </label>
      ) : (
        <label key="anual" className="text-sm font-medium text-slate-700">Ano
          <input type="number" name="ano" required min={1900} max={Number(ultima.slice(0, 4))} defaultValue={periodo.ano} className={field} />
        </label>
      )}
      <button type="submit" disabled={!condominios.length} className="h-11 rounded-lg bg-cyan-800 px-5 text-sm font-semibold text-white hover:bg-cyan-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 disabled:opacity-50">Aplicar período</button>
    </form>
  )
}
