"use client"

import Link from "next/link"
import type { ElementType, ReactNode } from "react"
import { useMemo, useState } from "react"
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardList,
  FileSignature,
  FileText,
} from "lucide-react"

import { EmptyState } from "@/components/data/empty-state"
import { StatusBadge } from "@/components/data/status-badge"
import { ButtonLink } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PendingSubmitButton } from "@/components/ui/pending-submit-button"
import {
  alterarStatusAcordosPreJuridico,
  gerarHistoricoAcordosPreJuridico,
  gerarListaAdministradoraPreJuridico,
  gerarProcuracaoPreJuridico,
} from "@/features/acordos/actions"
import { preJuridicoStepsCompletos, type PreJuridicoSteps } from "@/features/acordos/pre-juridico"
import { formatCurrency } from "@/utils/formatters/currency"
import { formatDateBR } from "@/utils/formatters/date"

type Row = {
  id: string
  condominio_id?: string | null
  unidade_id?: string | null
  cobranca_id?: string | null
  cobrancas?: { status?: string | null; status_operacional?: string | null } | null
  status?: string | null
  status_financeiro?: string | null
  fluxo_status?: string | null
  data_acordo?: string | null
  valor_acordado?: number | string | null
  valor_risco_operacional?: number | string | null
  valor_vincendas_fora_acordo?: number | string | null
  motivo_quebra_parcela?: boolean
  motivo_quebra_vincendas?: boolean
  pre_juridico_habilitado?: boolean
  pre_juridico_steps?: PreJuridicoSteps
  condominios?: { nome?: string | null } | null
  unidades?: { id?: string | null; identificacao?: string | null; bloco?: string | null; responsavel_nome?: string | null } | null
  parcelas_fora_janela?: Array<{ dias_atraso?: number | null; dias_reemissao_permitidos?: number | null }>
  vincendas_fora_acordo?: Array<unknown>
}

function isEncaminhado(row: Row) {
  const fluxo = String(row.fluxo_status ?? "").toLowerCase()
  const cobranca = String(row.cobrancas?.status_operacional ?? row.cobrancas?.status ?? "").toLowerCase()
  return fluxo.includes("pre_juridico") || cobranca.includes("pre_juridico")
}

function podePrepararPreJuridico(row: Row) {
  return !isEncaminhado(row) && Boolean(row.pre_juridico_habilitado) && !['cancelado', 'quitado', 'renegociado'].includes(String(row.status ?? '').toLowerCase())
}

function etapaLabel(row: Row) {
  if (isEncaminhado(row)) return "Encaminhado"
  return preJuridicoStepsCompletos(row.pre_juridico_steps) ? "Pronto" : "Pendente"
}

function etapaTone(row: Row) {
  const etapa = etapaLabel(row)
  if (etapa === "Encaminhado") return "bg-violet-50 text-violet-700"
  if (etapa === "Pronto") return "bg-emerald-50 text-emerald-700"
  return "bg-amber-50 text-amber-700"
}

function SelectedInputs({ selectedIds }: { selectedIds: string[] }) {
  return (
    <>
      {selectedIds.map((id) => (
        <input key={id} type="hidden" name="acordo_id" value={id} />
      ))}
    </>
  )
}

function StepMark({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${checked ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
      {checked ? <CheckCircle2 size={13} /> : <Circle size={13} />}
      {label}
    </span>
  )
}

function ActionCard({
  title,
  description,
  icon: Icon,
  action,
  selectedIds,
  disabled,
  pendingLabel,
  children,
  variant = "secondary",
  confirmMessage,
  openInNewTab = false,
}: {
  title: string
  description: string
  icon: ElementType
  action: (formData: FormData) => void | Promise<void>
  selectedIds: string[]
  disabled?: boolean
  pendingLabel: string
  children: ReactNode
  variant?: "primary" | "secondary"
  confirmMessage?: string
  openInNewTab?: boolean
}) {
  return (
    <Card className="p-4">
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
          </div>
        </div>
        <form action={action} target={openInNewTab ? "_blank" : undefined} className="mt-auto" onSubmit={(event) => {
          if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault()
        }}>
          <SelectedInputs selectedIds={selectedIds} />
          <PendingSubmitButton className="w-full" variant={variant} disabled={disabled} pendingLabel={pendingLabel}>
            {children}
          </PendingSubmitButton>
        </form>
      </div>
    </Card>
  )
}

export function PreJuridicoWorkbench({ rows }: { rows: Row[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedRows = useMemo(() => rows.filter((row) => selectedIds.includes(row.id)), [rows, selectedIds])
  const selectedReady = selectedRows.length > 0 && selectedRows.every((row) => preJuridicoStepsCompletos(row.pre_juridico_steps))
  const selectableRows = useMemo(() => rows.filter(podePrepararPreJuridico), [rows])
  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedIds.includes(row.id))
  const missingPdf = selectedRows.filter((row) => !row.pre_juridico_steps?.historico).length
  const missingList = selectedRows.filter((row) => !row.pre_juridico_steps?.listaAdministradora).length
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; rows: Row[] }>()
    for (const row of rows) {
      const id = row.condominio_id || row.condominios?.nome || 'sem-condominio'
      const group = map.get(id) ?? { id, nome: row.condominios?.nome ?? 'Condomínio não informado', rows: [] }
      group.rows.push(row)
      map.set(id, group)
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [rows])

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : selectableRows.map((row) => row.id))
  }

  const toggleOne = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const toggleGroup = (groupRows: Row[]) => {
    const ids = groupRows.filter(podePrepararPreJuridico).map((row) => row.id)
    const selected = ids.length > 0 && ids.every((id) => selectedIds.includes(id))
    setSelectedIds((current) => selected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids])))
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ActionCard
          title="Dossiê dos casos"
          description="Gera o histórico pré-jurídico, com uma unidade por página."
          icon={FileText}
          action={gerarHistoricoAcordosPreJuridico}
          selectedIds={selectedIds}
          disabled={selectedIds.length === 0}
          pendingLabel="Gerando PDF..."
        >
          Gerar PDF
        </ActionCard>
        <ActionCard
          title="Relação para administradora"
          description="Prepara a relação por administradora e o resumo por condomínio."
          icon={ClipboardList}
          action={gerarListaAdministradoraPreJuridico}
          selectedIds={selectedIds}
          disabled={selectedIds.length === 0}
          pendingLabel="Gerando lista..."
        >
          Gerar lista PDF
        </ActionCard>
        <ActionCard
          title="Procuração opcional"
          description="Gera uma procuração em PDF quando o jurídico solicitar."
          icon={FileSignature}
          action={gerarProcuracaoPreJuridico}
          selectedIds={selectedIds}
          disabled={selectedIds.length === 0}
          pendingLabel="Gerando procuração..."
          openInNewTab
        >
          Gerar procuração PDF
        </ActionCard>
        <ActionCard
          title="Encaminhar ao jurídico"
          description="Altera os casos, reúne as cobranças e prepara as comunicações."
          icon={BriefcaseBusiness}
          action={alterarStatusAcordosPreJuridico}
          selectedIds={selectedIds}
          disabled={!selectedReady}
          pendingLabel="Encaminhando..."
          variant="primary"
          confirmMessage={`Encaminhar ${selectedIds.length} caso(s) ao pré-jurídico? Os status serão alterados e as comunicações para carteira, administradora e síndico serão preparadas.`}
        >
          Encaminhar casos prontos
        </ActionCard>
      </section>

      {selectedIds.length > 0 ? (
        <div className="sticky top-3 z-20 flex flex-col gap-2 rounded-2xl border border-[#d7eef5] bg-[#edf8fb]/95 px-4 py-3 shadow-lg backdrop-blur md:flex-row md:items-center md:justify-between" role="status">
          <div>
            <p className="text-sm font-semibold text-slate-950">{selectedIds.length} caso(s) selecionado(s) · {selectedRows.filter((row) => preJuridicoStepsCompletos(row.pre_juridico_steps)).length} pronto(s)</p>
            <p className="mt-0.5 text-xs text-slate-600">{missingPdf} sem dossiê · {missingList} sem relação da administradora</p>
          </div>
          <button type="button" onClick={() => setSelectedIds([])} className="text-left text-xs font-semibold text-[var(--gkli-primary)] hover:underline">Limpar seleção</button>
        </div>
      ) : null}

      <Card className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Sem acordos quebrados" description="Nenhum acordo quebrado foi encontrado neste filtro." />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]"
                  checked={allSelected}
                  disabled={selectableRows.length === 0}
                  onChange={toggleAll}
                />
                Selecionar todos
              </label>
              <p className="text-sm text-slate-500">
                {selectedIds.length} de {rows.length} selecionado(s)
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {groups.map((group) => {
                const groupSelectable = group.rows.filter(podePrepararPreJuridico)
                const groupSelected = groupSelectable.length > 0 && groupSelectable.every((row) => selectedIds.includes(row.id))
                const groupValue = group.rows.reduce((sum, row) => sum + Number(row.valor_risco_operacional ?? row.valor_acordado ?? 0), 0)
                return <details key={group.id} className="group/condominio bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-slate-50/70 px-4 py-2.5 transition hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
                    <div className="flex min-w-0 items-center gap-3">
                      <ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open/condominio:rotate-180" />
                      <input aria-label={`Selecionar casos de ${group.nome}`} type="checkbox" checked={groupSelected} disabled={groupSelectable.length === 0} onClick={(event) => event.stopPropagation()} onChange={() => toggleGroup(group.rows)} className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]" />
                      <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-950">{group.nome}</p><p className="mt-0.5 text-xs text-slate-500">{group.rows.length} caso(s)</p></div>
                    </div>
                    <div className="text-right"><p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Valor em risco</p><p className="mt-0.5 text-sm font-semibold text-slate-950">{formatCurrency(groupValue)}</p></div>
                  </summary>
                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {group.rows.map((row) => {
                const steps = row.pre_juridico_steps
                const parcelaQuebrada = row.parcelas_fora_janela?.[0]
                return (
                  <div key={row.id} className="grid gap-4 px-4 py-3 xl:grid-cols-[32px_minmax(300px,1.2fr)_170px_220px_160px] xl:items-center">
                    <div className="flex items-start">
                      <input
                        aria-label={`Selecionar acordo de ${row.condominios?.nome ?? "condomínio não informado"}, unidade ${row.unidades?.identificacao ?? "não informada"}`}
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]"
                        checked={selectedIds.includes(row.id)}
                        disabled={!podePrepararPreJuridico(row)}
                        onChange={() => toggleOne(row.id)}
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={row.status ?? "quebrado"} />
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${etapaTone(row)}`}>{etapaLabel(row)}</span>
                      </div>
                      <Link href={`/app/acordos/${row.id}`} className="mt-2 block truncate text-sm font-semibold text-slate-950 hover:text-[var(--gkli-primary)]">
                        {row.unidades?.bloco ? `Bloco ${row.unidades.bloco} · ` : ''}Unidade {row.unidades?.identificacao ?? "-"}
                      </Link>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {row.unidades?.responsavel_nome ?? "Responsável não informado"} · acordo em {formatDateBR(row.data_acordo)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_acordado ?? 0))}</p>
                      {Number(row.valor_vincendas_fora_acordo ?? 0) > 0 ? (
                        <p className="mt-1 text-xs text-slate-500">+ {formatCurrency(Number(row.valor_vincendas_fora_acordo ?? 0))}</p>
                      ) : null}
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Quebra</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {parcelaQuebrada ? (
                          <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">
                            {parcelaQuebrada.dias_atraso}d &gt; {parcelaQuebrada.dias_reemissao_permitidos}d
                          </span>
                        ) : null}
                        {row.vincendas_fora_acordo?.length ? (
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                            {row.vincendas_fora_acordo.length} vincenda(s)
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        <StepMark checked={Boolean(steps?.historico)} label="PDF" />
                        <StepMark checked={Boolean(steps?.listaAdministradora)} label="Lista" />
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <ButtonLink href={`/app/acordos/${row.id}`} variant="ghost" size="sm" aria-label="Abrir acordo">
                          <ArrowUpRight size={14} />
                        </ButtonLink>
                      </div>
                    </div>
                  </div>
                )
                  })}
                  </div>
                </details>
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
