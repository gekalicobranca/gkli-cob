'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowUpRight, ChevronDown, Gauge } from 'lucide-react'
import { EmptyState } from '@/components/data/empty-state'
import { StatusBadge } from '@/components/data/status-badge'
import { ListCollapsibleSectionHeader } from '@/components/layout/list-page'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { ativarCobrancasFiltradasFlowCobranca } from '@/features/flows/cobranca/actions'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'

type Row = {
  id: string
  condominio_id?: string | null
  unidade_id?: string | null
  vencimento?: string | null
  competencia?: string | null
  valor_original?: number | string | null
  valor_atualizado?: number | string | null
  status?: string | null
  status_operacional?: string | null
  status_financeiro?: string | null
  condominio?: { nome?: string | null; nome_operacional?: string | null } | null
  unidade?: { identificacao?: string | null; bloco?: string | null; responsavel_nome?: string | null } | null
}

function isNovo(row: Row) {
  return row.status_operacional === 'novo' || row.status === 'novo'
}

function hasResponsavel(row: Row) {
  return Boolean(String(row.unidade?.responsavel_nome ?? '').trim())
}

function isAtivavel(row: Row) {
  return isNovo(row) && hasResponsavel(row)
}

export function FlowCobrancaPainelWorkbench({ rows, returnQuery = '' }: { rows: Row[]; returnQuery?: string }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const novas = useMemo(() => rows.filter(isNovo), [rows])
  const ativaveis = useMemo(() => novas.filter(hasResponsavel), [novas])
  const bloqueadasSemResponsavel = novas.length - ativaveis.length
  const allSelected = ativaveis.length > 0 && ativaveis.every((row) => selectedIds.includes(row.id))
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; rows: Row[] }>()
    for (const row of rows) {
      const id = row.condominio_id || 'sem-condominio'
      const nome = row.condominio?.nome_operacional || row.condominio?.nome || 'Condomínio não informado'
      const group = map.get(id) ?? { id, nome, rows: [] }
      group.rows.push(row)
      map.set(id, group)
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [rows])

  const toggleOne = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleAll = () => setSelectedIds(allSelected ? [] : ativaveis.map((row) => row.id))
  const toggleGroup = (groupRows: Row[]) => {
    const ids = groupRows.filter(isAtivavel).map((row) => row.id)
    const selected = ids.length > 0 && ids.every((id) => selectedIds.includes(id))
    setSelectedIds((current) => selected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids])))
  }

  if (rows.length === 0) {
    return (
      <Card className="overflow-hidden p-0">
        <details className="group bg-white">
          <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <ListCollapsibleSectionHeader title="Cobranças novas" count={0} />
          </summary>
          <div className="p-5">
            <EmptyState title="Nenhuma cobrança nova" description="Não há cobranças novas neste filtro." />
          </div>
        </details>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><Gauge size={18} /></div>
            <div><h2 className="text-sm font-semibold text-slate-950">Ativar cobranças selecionadas</h2><p className="mt-1 text-xs text-slate-500">Depois da ativação, as cobranças entram na esteira de cobrança ativa.</p>{bloqueadasSemResponsavel ? <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"><AlertTriangle size={13} />{bloqueadasSemResponsavel} cobrança(s) sem responsável não podem evoluir.</p> : null}</div>
          </div>
          <form action={ativarCobrancasFiltradasFlowCobranca} onSubmit={(event) => { if (!window.confirm(`Ativar ${selectedIds.length} cobrança(s)?`)) event.preventDefault() }}>
            {selectedIds.map((id) => <input key={id} type="hidden" name="cobranca_id" value={id} />)}
            <input type="hidden" name="return_query" value={returnQuery} />
            <PendingSubmitButton disabled={selectedIds.length === 0} pendingLabel="Ativando...">Ativar {selectedIds.length || ''} cobrança(s)</PendingSubmitButton>
          </form>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <details open={rows.length > 0} className="group bg-white">
          <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <ListCollapsibleSectionHeader title="Cobranças novas" count={rows.length} />
          </summary>
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={allSelected} disabled={ativaveis.length === 0} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)]" />Selecionar todas aptas</label>
            <div className="flex flex-wrap items-center gap-3 md:justify-end">
              <p className="text-sm text-slate-500">{selectedIds.length} de {ativaveis.length} apta(s){bloqueadasSemResponsavel ? ` · ${bloqueadasSemResponsavel} sem responsável` : ''}</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">{groups.map((group) => {
            const groupNovas = group.rows.filter(isAtivavel)
            const groupSelected = groupNovas.length > 0 && groupNovas.every((row) => selectedIds.includes(row.id))
            const value = group.rows.reduce((sum, row) => sum + Number(row.valor_atualizado ?? row.valor_original ?? 0), 0)
            return <details key={group.id} className="group/condominio bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-slate-50/70 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                <div className="flex min-w-0 items-center gap-3"><ChevronDown size={18} className="text-slate-400 transition-transform group-open/condominio:rotate-180" /><input aria-label={`Selecionar cobranças de ${group.nome}`} type="checkbox" checked={groupSelected} disabled={groupNovas.length === 0} onClick={(event) => event.stopPropagation()} onChange={() => toggleGroup(group.rows)} className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)]" /><div><p className="text-sm font-semibold text-slate-950">{group.nome}</p><p className="text-xs text-slate-500">{group.rows.length} cobrança(s)</p></div></div>
                <p className="text-sm font-semibold text-slate-950">{formatCurrency(value)}</p>
              </summary>
              <div className="divide-y divide-slate-100 border-t border-slate-100">{group.rows.map((row) => <div key={row.id} className="grid gap-3 px-4 py-3 xl:grid-cols-[32px_minmax(280px,1fr)_150px_150px_160px_48px] xl:items-center">
                <input aria-label={`Selecionar cobrança da unidade ${row.unidade?.identificacao ?? ''}`} type="checkbox" checked={selectedIds.includes(row.id)} disabled={!isAtivavel(row)} onChange={() => toggleOne(row.id)} className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] disabled:cursor-not-allowed disabled:opacity-40" />
                <div><div className="flex flex-wrap gap-2"><StatusBadge status={row.status_operacional || 'novo'} /><StatusBadge status={row.status_financeiro || 'em_aberto'} />{!hasResponsavel(row) ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"><AlertTriangle size={12} />Sem responsável</span> : null}</div><Link href={`/app/cobrancas/${row.id}`} className="mt-2 block text-sm font-semibold text-slate-950 hover:text-[var(--gkli-primary)]">{row.unidade?.bloco ? `Bloco ${row.unidade.bloco} · ` : ''}Unidade {row.unidade?.identificacao || '-'}</Link><p className="mt-1 text-xs text-slate-500">{row.unidade?.responsavel_nome || 'Vincule um responsável antes de ativar'}</p></div>
                <div><p className="text-xs uppercase tracking-[0.14em] text-slate-400">Vencimento</p><p className="mt-1 text-sm font-medium">{formatDateBR(row.vencimento)}</p></div>
                <div><p className="text-xs uppercase tracking-[0.14em] text-slate-400">Competência</p><p className="mt-1 text-sm font-medium">{row.competencia || '-'}</p></div>
                <div><p className="text-xs uppercase tracking-[0.14em] text-slate-400">Valor</p><p className="mt-1 text-sm font-semibold">{formatCurrency(Number(row.valor_atualizado ?? row.valor_original ?? 0))}</p></div>
                <ButtonLink href={`/app/cobrancas/${row.id}`} variant="ghost" size="sm" aria-label="Abrir cobrança"><ArrowUpRight size={14} /></ButtonLink>
              </div>)}</div>
            </details>
          })}</div>
        </details>
      </Card>
    </div>
  )
}
