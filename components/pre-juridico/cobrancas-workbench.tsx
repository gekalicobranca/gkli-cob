'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowUpRight, ChevronDown, Scale } from 'lucide-react'
import { EmptyState } from '@/components/data/empty-state'
import { StatusBadge } from '@/components/data/status-badge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { encaminharCobrancasPreJuridico } from '@/features/pre-juridico/actions'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'

type Row = {
  id: string
  carteira_id?: string | null
  condominio_id?: string | null
  unidade_id?: string | null
  vencimento?: string | null
  competencia?: string | null
  valor_original?: number | string | null
  valor_atualizado?: number | string | null
  status_operacional?: string | null
  status_financeiro?: string | null
  dias_atraso: number
  prazo_total: number
  situacao_pre_juridico: 'elegivel' | 'encaminhado'
  carteira?: { nome?: string | null } | null
  condominio?: { nome?: string | null; nome_operacional?: string | null } | null
  unidade?: { identificacao?: string | null; bloco?: string | null; responsavel_nome?: string | null } | null
}

export function PreJuridicoCobrancasWorkbench({ rows }: { rows: Row[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const elegiveis = useMemo(() => rows.filter((row) => row.situacao_pre_juridico === 'elegivel'), [rows])
  const allSelected = elegiveis.length > 0 && elegiveis.every((row) => selectedIds.includes(row.id))
  const groups = useMemo(() => {
    const map = new Map<string, {
      carteiraId: string
      carteira: string
      condominios: Array<{ id: string; nome: string; rows: Row[] }>
      rows: Row[]
      value: number
    }>()
    for (const row of rows) {
      const carteiraId = row.carteira_id || 'sem-carteira'
      const carteira = row.carteira?.nome || 'Carteira não informada'
      const carteiraGroup = map.get(carteiraId) ?? {
        carteiraId,
        carteira,
        condominios: [],
        rows: [],
        value: 0,
      }
      const condominioId = row.condominio_id || 'sem-condominio'
      const condominioNome = row.condominio?.nome_operacional || row.condominio?.nome || 'Condomínio não informado'
      let condominioGroup = carteiraGroup.condominios.find((item) => item.id === condominioId)
      if (!condominioGroup) {
        condominioGroup = { id: condominioId, nome: condominioNome, rows: [] }
        carteiraGroup.condominios.push(condominioGroup)
      }
      const value = Number(row.valor_atualizado ?? row.valor_original ?? 0)
      condominioGroup.rows.push(row)
      carteiraGroup.rows.push(row)
      carteiraGroup.value += value
      map.set(carteiraId, carteiraGroup)
    }
    return Array.from(map.values())
      .map((group) => ({
        ...group,
        condominios: group.condominios
          .map((condominio) => ({
            ...condominio,
            value: condominio.rows.reduce((sum, row) => sum + Number(row.valor_atualizado ?? row.valor_original ?? 0), 0),
          }))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      }))
      .sort((a, b) => a.carteira.localeCompare(b.carteira, 'pt-BR'))
  }, [rows])

  const toggleOne = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleAll = () => setSelectedIds(allSelected ? [] : elegiveis.map((row) => row.id))
  const toggleGroup = (groupRows: Row[]) => {
    const ids = groupRows.filter((row) => row.situacao_pre_juridico === 'elegivel').map((row) => row.id)
    const selected = ids.length > 0 && ids.every((id) => selectedIds.includes(id))
    setSelectedIds((current) => selected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids])))
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><Scale size={18} /></div>
            <div><h2 className="text-sm font-semibold text-slate-950">Encaminhar cobranças selecionadas</h2><p className="mt-1 text-xs text-slate-500">Depois do encaminhamento, inicie o andamento na tela Processamento.</p></div>
          </div>
          <form action={encaminharCobrancasPreJuridico} onSubmit={(event) => { if (!window.confirm(`Encaminhar ${selectedIds.length} cobrança(s) ao pré-jurídico?`)) event.preventDefault() }}>
            {selectedIds.map((id) => <input key={id} type="hidden" name="cobranca_id" value={id} />)}
            <PendingSubmitButton disabled={selectedIds.length === 0} pendingLabel="Encaminhando...">Encaminhar {selectedIds.length || ''} cobrança(s)</PendingSubmitButton>
          </form>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <details open={rows.length > 0} className="group/lista bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open/lista:rotate-180" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">Lista pré-jurídica</p>
                <p className="mt-0.5 text-xs text-slate-500">{groups.length} carteira(s) · {rows.length} cobrança(s) no recorte</p>
              </div>
            </div>
            <p className="shrink-0 text-sm text-slate-500">{selectedIds.length} de {elegiveis.length} elegível(is)</p>
          </summary>

          {rows.length === 0 ? <div className="p-5"><EmptyState title="Nenhuma cobrança no pré-jurídico" description="Não há cobranças elegíveis ou já encaminhadas neste filtro." /></div> : <>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={allSelected} disabled={elegiveis.length === 0} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)]" />Selecionar todas as elegíveis</label>
              <p className="text-sm text-slate-500">{selectedIds.length} de {elegiveis.length} elegível(is)</p>
            </div>
            <div className="divide-y divide-slate-100">{groups.map((carteiraGroup) => {
              const carteiraEligible = carteiraGroup.rows.filter((row) => row.situacao_pre_juridico === 'elegivel')
              const carteiraSelected = carteiraEligible.length > 0 && carteiraEligible.every((row) => selectedIds.includes(row.id))
              return <details key={carteiraGroup.carteiraId} className="group/carteira bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-y border-slate-200 bg-slate-100/80 px-4 py-3 transition hover:bg-slate-200/70 first:border-t-0 [&::-webkit-details-marker]:hidden">
                  <div className="flex min-w-0 items-center gap-3">
                    <ChevronDown size={17} className="shrink-0 text-slate-500 transition-transform group-open/carteira:rotate-180" />
                    <input aria-label={`Selecionar cobranças de ${carteiraGroup.carteira}`} type="checkbox" checked={carteiraSelected} disabled={carteiraEligible.length === 0} onClick={(event) => event.stopPropagation()} onChange={() => toggleGroup(carteiraGroup.rows)} className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)]" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">{carteiraGroup.carteira}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{carteiraGroup.condominios.length} condomínio(s) · {carteiraGroup.rows.length} cobrança(s)</p>
                    </div>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-slate-950">{formatCurrency(carteiraGroup.value)}</p>
                </summary>

                <div className="divide-y divide-slate-100">
                  {carteiraGroup.condominios.map((group) => {
                    const groupEligible = group.rows.filter((row) => row.situacao_pre_juridico === 'elegivel')
                    const groupSelected = groupEligible.length > 0 && groupEligible.every((row) => selectedIds.includes(row.id))
                    return <details key={group.id} className="group/condominio bg-white">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-7 py-2.5 transition hover:bg-slate-100/80 [&::-webkit-details-marker]:hidden">
                        <div className="flex min-w-0 items-center gap-3">
                          <ChevronDown size={16} className="shrink-0 text-slate-400 transition-transform group-open/condominio:rotate-180" />
                          <input aria-label={`Selecionar cobranças de ${group.nome}`} type="checkbox" checked={groupSelected} disabled={groupEligible.length === 0} onClick={(event) => event.stopPropagation()} onChange={() => toggleGroup(group.rows)} className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)]" />
                          <div className="min-w-0"><p className="text-sm font-semibold text-slate-950">{group.nome}</p><p className="text-xs text-slate-500">{group.rows.length} cobrança(s)</p></div>
                        </div>
                        <p className="shrink-0 text-sm font-semibold text-slate-700">{formatCurrency(group.value)}</p>
                      </summary>
                      <div className="divide-y divide-slate-100 border-t border-slate-100">{group.rows.map((row) => <div key={row.id} className="grid gap-3 px-4 py-3 xl:grid-cols-[32px_minmax(280px,1fr)_150px_150px_160px_48px] xl:items-center">
                        <input aria-label={`Selecionar cobrança da unidade ${row.unidade?.identificacao ?? ''}`} type="checkbox" checked={selectedIds.includes(row.id)} disabled={row.situacao_pre_juridico !== 'elegivel'} onChange={() => toggleOne(row.id)} className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)]" />
                        <div><div className="flex flex-wrap gap-2"><StatusBadge status={row.situacao_pre_juridico} /><StatusBadge status={row.status_financeiro || 'em_aberto'} /></div><Link href={`/app/cobrancas/${row.id}`} className="mt-2 block text-sm font-semibold text-slate-950 hover:text-[var(--gkli-primary)]">{row.unidade?.bloco ? `Bloco ${row.unidade.bloco} · ` : ''}Unidade {row.unidade?.identificacao || '-'}</Link><p className="mt-1 text-xs text-slate-500">{row.unidade?.responsavel_nome || 'Responsável não informado'}</p></div>
                        <div><p className="text-xs uppercase tracking-[0.14em] text-slate-400">Vencimento</p><p className="mt-1 text-sm font-medium">{formatDateBR(row.vencimento)}</p></div>
                        <div><p className="text-xs uppercase tracking-[0.14em] text-slate-400">Atraso / regra</p><p className="mt-1 text-sm font-medium">D+{row.dias_atraso} / D+{row.prazo_total}</p></div>
                        <div><p className="text-xs uppercase tracking-[0.14em] text-slate-400">Valor</p><p className="mt-1 text-sm font-semibold">{formatCurrency(Number(row.valor_atualizado ?? row.valor_original ?? 0))}</p></div>
                        <ButtonLink href={`/app/cobrancas/${row.id}`} variant="ghost" size="sm" aria-label="Abrir cobrança"><ArrowUpRight size={14} /></ButtonLink>
                      </div>)}</div>
                    </details>
                  })}
                </div>
              </details>
            })}</div>
          </>}
        </details>
      </Card>
    </div>
  )
}
