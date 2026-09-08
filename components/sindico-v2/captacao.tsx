'use client'

import { useState } from 'react'
import { AreaRecolhivel } from './area-recolhivel'
import type { CaptacaoSindico } from '@/features/sindico-v2/captacao'
import { tituloCompetencia } from '@/features/sindico-v2/periodos'

const moeda = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
const dataBR = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))

export function CaptacaoArea({ data }: { data: CaptacaoSindico }) {
  const [competencia, setCompetencia] = useState(data.ciclos.at(-1)?.competencia ?? '')
  const [pagina, setPagina] = useState(1)
  const ciclo = data.ciclos.find((item) => item.competencia === competencia)
  const tamanho = 20
  const linhas = ciclo?.unidades.slice((pagina - 1) * tamanho, pagina * tamanho) ?? []
  const paginas = Math.max(1, Math.ceil((ciclo?.unidades.length ?? 0) / tamanho))
  const grupos = new Map<string, number>()
  for (const unidade of ciclo?.unidades ?? []) grupos.set(unidade.situacao, (grupos.get(unidade.situacao) ?? 0) + Math.round(unidade.valor * 100))
  const disponivel = ciclo?.estado === 'disponivel'
  const maior = Math.max(1, ...data.ciclos.map((item) => item.valor ?? 0))
  const referencia = disponivel && ciclo.referencia ? dataBR(ciclo.referencia) : 'Sem referência validada'
  const detalheFonte = ciclo?.fonte === 'historico'
    ? `${ciclo.confirmacoes} linha(s) conciliada(s); registros incompletos não são exibidos.`
    : ciclo && ciclo.confirmacoes > 1
      ? `${ciclo.confirmacoes} confirmações no ciclo; exibida apenas a última, sem somar relatórios repetidos.`
      : 'Uma confirmação no ciclo.'
  return <AreaRecolhivel titulo="Captação" descricao="Débitos identificados nos relatórios confirmados e históricos conciliados." numero="01"
    resumo={data.estado === 'erro' ? 'Falha ao carregar' : `${data.ciclosDisponiveis}/${data.ciclos.length} ciclos com relatório`}
    dashboard={<>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Débitos na captação', disponivel ? moeda(ciclo.valor!) : 'Histórico indisponível'],
          ['Unidades na captação', disponivel ? String(ciclo.unidades.length) : 'Histórico indisponível'],
          ['Referência da captação', referencia],
        ].map(([titulo, valor]) => <div key={titulo} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">{titulo}</p><p className="mt-2 text-lg font-semibold text-slate-900">{valor}</p></div>)}
      </div>
      {disponivel && <div className="mt-5"><h3 className="mb-3 text-sm font-semibold">Composição dos débitos na captação</h3>
        <div className="grid gap-3 sm:grid-cols-2">{[...grupos].map(([situacao, centavos]) => <div key={situacao}>
          <div className="flex justify-between gap-3 text-sm"><span>{situacao}</span><span>{moeda(centavos / 100)}</span></div>
          <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-cyan-700" style={{ width: `${ciclo.valor ? centavos / 100 / ciclo.valor * 100 : 0}%` }} /></div>
        </div>)}</div>
      </div>}
      {data.ciclos.length > 1 && <div className="mt-5"><h3 className="text-sm font-semibold">Relatório de cada ciclo</h3><p className="mt-1 text-xs text-slate-500">Posições mensais. Os saldos não são somados entre ciclos.</p>
        <div className="mt-3 space-y-2">{data.ciclos.map((item) => <div key={item.competencia} className="grid grid-cols-[4rem_1fr] items-center gap-3 text-xs sm:grid-cols-[4rem_1fr_11rem]">
          <span>{item.competencia.split('-').reverse().join('/')}</span>
          <div className="hidden h-2 overflow-hidden rounded bg-slate-200 sm:block" aria-hidden="true"><div className="h-full bg-cyan-700" style={{ width: `${(item.valor ?? 0) / maior * 100}%` }} /></div>
          <span className="text-right">{item.valor === null ? 'Histórico indisponível' : moeda(item.valor)}</span>
        </div>)}</div>
      </div>}
    </>}>
    {data.estado === 'erro' ? <p role="alert" className="text-sm text-amber-900">Não foi possível carregar a captação. Atualize a página para tentar novamente.</p> : <>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h3 className="font-semibold">Detalhamento da captação</h3>
        <p className="mt-1 text-sm text-slate-500">Último relatório confirmado ou histórico conciliado de cada ciclo. A referência é a data da captação, não a posição no fechamento.</p></div>
        {data.ciclos.length > 1 && <label className="text-sm text-slate-600">Ciclo dos indicadores e detalhes
          <select value={competencia} onChange={(event) => { setCompetencia(event.target.value); setPagina(1) }} className="mt-1 block h-11 max-w-full rounded-lg border border-slate-300 bg-white px-3">
            {data.ciclos.map((item) => <option key={item.competencia} value={item.competencia}>{tituloCompetencia(item.competencia)}</option>)}
          </select>
        </label>}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Os valores representam os débitos do relatório, incluindo itens que já estavam em acompanhamento. Não representam somente novas cobranças incluídas na operação.</p>
      {!disponivel ? <p role="status" className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-950">{ciclo?.motivo ?? 'Histórico indisponível para este período.'}</p> : <>
        <p className="mt-3 text-xs text-slate-500">{detalheFonte} Situações registradas na data da captação.</p>
        {!ciclo.unidades.length ? <p className="mt-4 text-sm">O relatório confirmado não registra débitos.</p> : <>
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[620px] text-left text-sm">
            <caption className="sr-only">Unidades do relatório de {tituloCompetencia(competencia)}</caption>
            <thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Bloco', 'Unidade', 'Situação na captação', 'Débito inicial', 'Débito final', 'Valor'].map((item) => <th scope="col" className="px-3 py-3 font-medium" key={item}>{item}</th>)}</tr></thead>
            <tbody>{linhas.map((item) => <tr key={item.chave} className="border-t border-slate-100"><td className="px-3 py-3">{item.bloco || '—'}</td><td className="px-3 py-3 font-medium">{item.unidade}</td><td className="px-3 py-3">{item.situacao}</td><td className="px-3 py-3">{item.debitoInicial || '—'}</td><td className="px-3 py-3">{item.debitoFinal || '—'}</td><td className="whitespace-nowrap px-3 py-3 text-right">{moeda(item.valor)}</td></tr>)}</tbody>
          </table></div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm"><span aria-live="polite">Página {pagina} de {paginas} · {ciclo.unidades.length} unidades</span>
            <div className="flex gap-2"><button type="button" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Anterior</button><button type="button" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Próxima</button></div>
          </div>
        </>}
      </>}
    </>}
  </AreaRecolhivel>
}
