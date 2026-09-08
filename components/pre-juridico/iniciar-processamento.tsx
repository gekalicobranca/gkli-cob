'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, FileText } from 'lucide-react'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { ListEmptyState, ListPanel, ListPanelHeader, ListRow, ListRows, ListTitle } from '@/components/layout/list-page'
import { gerarLaudosPreJuridico } from '@/features/pre-juridico/actions'
import { formatCurrency } from '@/utils/formatters/currency'

type Row = {
  id: string
  carteira_id?: string | null
  condominio_id?: string | null
  vencimento?: string | null
  valor_original?: number | string | null
  valor_atualizado?: number | string | null
  valor_unidade?: number | string | null
  quantidade_cobrancas?: number
  carteira?: { nome?: string | null } | null
  condominio?: { nome?: string | null; nome_operacional?: string | null } | null
  unidade?: { identificacao?: string | null; bloco?: string | null; responsavel_nome?: string | null } | null
}

function valorRow(row: Row) {
  return Number(row.valor_unidade ?? row.valor_atualizado ?? row.valor_original ?? 0)
}

export function IniciarProcessamento({ rows }: { rows: Row[] }) {
  const [selected, setSelected] = useState<string[]>([])
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id))
  const total = useMemo(() => rows.filter((row) => selected.includes(row.id)).reduce((sum, row) => sum + valorRow(row), 0), [rows, selected])
  const groups = useMemo(() => {
    const map = new Map<string, {
      carteiraId: string
      carteira: string
      condominios: Array<{ id: string; nome: string; rows: Row[]; value: number }>
      rows: Row[]
      value: number
    }>()

    for (const row of rows) {
      const carteiraId = row.carteira_id || 'sem-carteira'
      const carteiraGroup = map.get(carteiraId) ?? {
        carteiraId,
        carteira: row.carteira?.nome || 'Carteira não informada',
        condominios: [],
        rows: [],
        value: 0,
      }
      const condominioId = row.condominio_id || 'sem-condominio'
      let condominioGroup = carteiraGroup.condominios.find((item) => item.id === condominioId)
      if (!condominioGroup) {
        condominioGroup = {
          id: condominioId,
          nome: row.condominio?.nome_operacional || row.condominio?.nome || 'Condomínio não informado',
          rows: [],
          value: 0,
        }
        carteiraGroup.condominios.push(condominioGroup)
      }
      const value = valorRow(row)
      condominioGroup.rows.push(row)
      condominioGroup.value += value
      carteiraGroup.rows.push(row)
      carteiraGroup.value += value
      map.set(carteiraId, carteiraGroup)
    }

    return Array.from(map.values())
      .map((group) => ({
        ...group,
        condominios: group.condominios.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      }))
      .sort((a, b) => a.carteira.localeCompare(b.carteira, 'pt-BR'))
  }, [rows])
  const toggleAll = () => setSelected(allSelected ? [] : rows.map((row) => row.id))
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleGroup = (groupRows: Row[]) => {
    const ids = groupRows.map((row) => row.id)
    const groupSelected = ids.length > 0 && ids.every((id) => selected.includes(id))
    setSelected((current) => groupSelected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids])))
  }

  return <ListPanel><details open={rows.length > 0} className="group bg-white">
    <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
      <ListPanelHeader className="flex items-center justify-between gap-4 bg-white/80 group-hover:bg-slate-50">
        <ListTitle title="Aguardando início" description="Unidades encaminhadas que ainda não possuem um andamento operacional." />
        <div className="flex shrink-0 items-center gap-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{rows.length}</span><ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" /></div>
      </ListPanelHeader>
    </summary>
    <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={allSelected} disabled={!rows.length} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300" />Selecionar todas as unidades</label>
      <form action={gerarLaudosPreJuridico} onSubmit={(event) => { if (!window.confirm(`Gerar laudo para ${selected.length} unidade(s), agrupando todas as suas cobranças?`)) event.preventDefault() }}>
        {selected.map((id) => <input key={id} type="hidden" name="cobranca_id" value={id} />)}
        <PendingSubmitButton disabled={!selected.length} pendingLabel="Gerando laudos..."><FileText size={16} />Gerar laudo {selected.length ? `(${selected.length})` : ''}</PendingSubmitButton>
      </form>
    </div>
    {rows.length ? <ListRows>{groups.map((carteiraGroup) => {
      const carteiraSelected = carteiraGroup.rows.length > 0 && carteiraGroup.rows.every((row) => selected.includes(row.id))
      return <details key={carteiraGroup.carteiraId} className="group/carteira bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-y border-slate-200 bg-slate-100/80 px-4 py-3 transition hover:bg-slate-200/70 first:border-t-0 [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <ChevronDown size={17} className="shrink-0 text-slate-500 transition-transform group-open/carteira:rotate-180" />
            <input aria-label={`Selecionar unidades de ${carteiraGroup.carteira}`} type="checkbox" checked={carteiraSelected} onClick={(event) => event.stopPropagation()} onChange={() => toggleGroup(carteiraGroup.rows)} className="h-4 w-4 rounded border-slate-300" />
            <div className="min-w-0"><p className="text-sm font-semibold text-slate-950">{carteiraGroup.carteira}</p><p className="text-xs text-slate-500">{carteiraGroup.condominios.length} condomínio(s) · {carteiraGroup.rows.length} unidade(s)</p></div>
          </div>
          <p className="shrink-0 text-sm font-semibold text-slate-950">{formatCurrency(carteiraGroup.value)}</p>
        </summary>
        <div className="divide-y divide-slate-100">
          {carteiraGroup.condominios.map((group) => {
            const groupSelected = group.rows.length > 0 && group.rows.every((row) => selected.includes(row.id))
            return <details key={group.id} className="group/condominio bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-7 py-2.5 transition hover:bg-slate-100/80 [&::-webkit-details-marker]:hidden">
                <div className="flex min-w-0 items-center gap-3">
                  <ChevronDown size={16} className="shrink-0 text-slate-400 transition-transform group-open/condominio:rotate-180" />
                  <input aria-label={`Selecionar unidades de ${group.nome}`} type="checkbox" checked={groupSelected} onClick={(event) => event.stopPropagation()} onChange={() => toggleGroup(group.rows)} className="h-4 w-4 rounded border-slate-300" />
                  <div className="min-w-0"><p className="text-sm font-semibold text-slate-950">{group.nome}</p><p className="text-xs text-slate-500">{group.rows.length} unidade(s)</p></div>
                </div>
                <p className="shrink-0 text-sm font-semibold text-slate-700">{formatCurrency(group.value)}</p>
              </summary>
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {group.rows.map((row) => <ListRow key={row.id} className="md:grid-cols-[28px_minmax(260px,1fr)_130px_150px]">
                  <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} className="h-4 w-4 rounded border-slate-300" />
                  <div><p className="text-sm font-semibold text-slate-950">Unidade {row.unidade?.identificacao || '-'}</p><p className="mt-1 text-xs text-slate-500">{row.unidade?.responsavel_nome || 'Responsável não informado'}</p></div>
                  <div><p className="text-xs text-slate-400">Cobranças agrupadas</p><p className="mt-1 text-sm font-semibold">{row.quantidade_cobrancas ?? 1}</p></div>
                  <p className="text-sm font-semibold md:text-right">{formatCurrency(valorRow(row))}</p>
                </ListRow>)}
              </div>
            </details>
          })}
        </div>
      </details>
    })}</ListRows> : <ListEmptyState title="Nenhuma cobrança aguardando início" description="Não há cobranças encaminhadas sem processamento para os filtros selecionados." />}
    {selected.length ? <div className="border-t border-slate-100 px-5 py-3 text-right text-sm text-slate-600">Valor das unidades selecionadas: <strong>{formatCurrency(total)}</strong></div> : null}
  </details></ListPanel>
}
