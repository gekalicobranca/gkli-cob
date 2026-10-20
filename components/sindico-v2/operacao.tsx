'use client'

import { useState } from 'react'
import { AreaRecolhivel } from './area-recolhivel'
import type { AreaOperacaoSindico } from '@/features/sindico-v2/operacao'

export function OperacaoArea({ area }: { area: AreaOperacaoSindico }) {
  const [pagina, setPagina] = useState(1)
  const tamanho = 20
  const paginas = Math.max(1, Math.ceil(area.linhas.length / tamanho))
  return (
    <AreaRecolhivel titulo={area.titulo} descricao={area.descricao} numero={area.numero}
      resumo={area.erro ? 'Falha ao carregar' : `${area.linhas.length} registro(s)`}
      dashboard={area.erro ? <p role="alert" className="text-sm text-amber-900">Não foi possível carregar esta área. Atualize a página para tentar novamente.</p> : (
        <div className="grid gap-3 sm:grid-cols-3">
          {area.indicadores.map((item) => <div key={item.titulo} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">{item.titulo}</p><p className="mt-2 text-lg font-semibold text-slate-900">{item.valor}</p>
          </div>)}
        </div>
      )}>
      <p className="text-sm leading-6 text-slate-500">{area.aviso}</p>
      {!area.erro && (!area.linhas.length ? <p role="status" className="mt-4 rounded-lg bg-cyan-50 p-4 text-sm text-cyan-950">{area.vazio}</p> : <>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[680px] text-left text-sm">
            <caption className="sr-only">Detalhamento de {area.titulo}</caption>
            <thead className="bg-slate-50 text-xs text-slate-500"><tr>{area.colunas.map((coluna) => <th key={coluna} scope="col" className="px-3 py-3 font-medium">{coluna}</th>)}</tr></thead>
            <tbody>{area.linhas.slice((pagina - 1) * tamanho, pagina * tamanho).map((linha) => <tr key={linha.id} className="border-t border-slate-100">
              {linha.celulas.map((celula, index) => <td key={area.colunas[index]} className="px-3 py-3">{celula}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span aria-live="polite">Página {pagina} de {paginas} · {area.linhas.length} registros</span>
          <div className="flex gap-2">
            <button type="button" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Anterior</button>
            <button type="button" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Próxima</button>
          </div>
        </div>
      </>)}
    </AreaRecolhivel>
  )
}
