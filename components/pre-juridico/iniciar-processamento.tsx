'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, FileText } from 'lucide-react'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { ListEmptyState, ListPanel, ListPanelHeader, ListRow, ListRows, ListTitle } from '@/components/layout/list-page'
import { gerarLaudosPreJuridico } from '@/features/pre-juridico/actions'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'

type Row = {
  id: string
  vencimento?: string | null
  valor_original?: number | string | null
  valor_atualizado?: number | string | null
  condominio?: { nome?: string | null; nome_operacional?: string | null } | null
  unidade?: { identificacao?: string | null; bloco?: string | null; responsavel_nome?: string | null } | null
}

export function IniciarProcessamento({ rows }: { rows: Row[] }) {
  const [selected, setSelected] = useState<string[]>([])
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id))
  const total = useMemo(() => rows.filter((row) => selected.includes(row.id)).reduce((sum, row) => sum + Number(row.valor_atualizado ?? row.valor_original ?? 0), 0), [rows, selected])
  const toggleAll = () => setSelected(allSelected ? [] : rows.map((row) => row.id))
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])

  return <ListPanel><details open={rows.length > 0} className="group bg-white">
    <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
      <ListPanelHeader className="flex items-center justify-between gap-4 bg-white/80 group-hover:bg-slate-50">
        <ListTitle title="Aguardando início" description="Cobranças encaminhadas que ainda não possuem um andamento operacional." />
        <div className="flex shrink-0 items-center gap-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{rows.length}</span><ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" /></div>
      </ListPanelHeader>
    </summary>
    <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={allSelected} disabled={!rows.length} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300" />Selecionar todas aguardando início</label>
      <form action={gerarLaudosPreJuridico} onSubmit={(event) => { if (!window.confirm(`Gerar laudo para ${selected.length} cobrança(s)?`)) event.preventDefault() }}>
        {selected.map((id) => <input key={id} type="hidden" name="cobranca_id" value={id} />)}
        <PendingSubmitButton disabled={!selected.length} pendingLabel="Gerando laudos..."><FileText size={16} />Gerar laudo {selected.length ? `(${selected.length})` : ''}</PendingSubmitButton>
      </form>
    </div>
    {rows.length ? <ListRows>{rows.map((row) => <ListRow key={row.id} className="md:grid-cols-[28px_minmax(260px,1fr)_130px_150px]">
      <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} className="h-4 w-4 rounded border-slate-300" />
      <div><p className="text-sm font-semibold text-slate-950">{row.condominio?.nome_operacional || row.condominio?.nome || 'Condomínio'} · Unidade {row.unidade?.identificacao || '-'}</p><p className="mt-1 text-xs text-slate-500">{row.unidade?.responsavel_nome || 'Responsável não informado'}</p></div>
      <div><p className="text-xs text-slate-400">Vencimento</p><p className="mt-1 text-sm">{formatDateBR(row.vencimento)}</p></div>
      <p className="text-sm font-semibold md:text-right">{formatCurrency(Number(row.valor_atualizado ?? row.valor_original ?? 0))}</p>
    </ListRow>)}</ListRows> : <ListEmptyState title="Nenhuma cobrança aguardando início" description="Não há cobranças encaminhadas sem processamento para os filtros selecionados." />}
    {selected.length ? <div className="border-t border-slate-100 px-5 py-3 text-right text-sm text-slate-600">Valor selecionado: <strong>{formatCurrency(total)}</strong></div> : null}
  </details></ListPanel>
}
