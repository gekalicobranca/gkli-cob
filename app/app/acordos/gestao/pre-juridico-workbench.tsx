"use client"

import Link from "next/link"
import type { ElementType, ReactNode } from "react"
import { useMemo, useState } from "react"
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
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
  status?: string | null
  status_financeiro?: string | null
  fluxo_status?: string | null
  data_acordo?: string | null
  valor_acordado?: number | string | null
  valor_risco_operacional?: number | string | null
  valor_vincendas_fora_acordo?: number | string | null
  motivo_quebra_parcela?: boolean
  motivo_quebra_vincendas?: boolean
  pre_juridico_steps?: PreJuridicoSteps
  condominios?: { nome?: string | null } | null
  unidades?: { id?: string | null; identificacao?: string | null; bloco?: string | null; responsavel_nome?: string | null } | null
  parcelas_fora_janela?: Array<{ dias_atraso?: number | null; dias_reemissao_permitidos?: number | null }>
  vincendas_fora_acordo?: Array<unknown>
}

function isEncaminhado(row: Row) {
  return String(row.fluxo_status ?? "").toLowerCase().includes("pre_juridico")
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
        <form action={action} className="mt-auto">
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
  const allSelected = rows.length > 0 && selectedIds.length === rows.length

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : rows.map((row) => row.id))
  }

  const toggleOne = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ActionCard
          title="Documento único"
          description="Gera o PDF pré-jurídico, com uma unidade por página."
          icon={FileText}
          action={gerarHistoricoAcordosPreJuridico}
          selectedIds={selectedIds}
          disabled={selectedIds.length === 0}
          pendingLabel="Gerando PDF..."
        >
          Gerar PDF
        </ActionCard>
        <ActionCard
          title="Lista para administradora"
          description="Gera um PDF com uma administradora por página e resumo por condomínio."
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
        >
          Gerar procuração PDF
        </ActionCard>
        <ActionCard
          title="Alterar status"
          description="Libera quando todos os selecionados têm PDF e lista cumpridos."
          icon={BriefcaseBusiness}
          action={alterarStatusAcordosPreJuridico}
          selectedIds={selectedIds}
          disabled={!selectedReady}
          pendingLabel="Encaminhando..."
          variant="primary"
        >
          Pré-jurídico
        </ActionCard>
      </section>

      <Card className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Sem acordos quebrados" description="Nenhum acordo com parcela fora da janela ou cotas vincendas fora do acordo foi encontrado neste filtro." />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]"
                  checked={allSelected}
                  onChange={toggleAll}
                />
                Selecionar todos
              </label>
              <p className="text-sm text-slate-500">
                {selectedIds.length} de {rows.length} selecionado(s)
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {rows.map((row) => {
                const steps = row.pre_juridico_steps
                const parcelaQuebrada = row.parcelas_fora_janela?.[0]
                return (
                  <div key={row.id} className="grid gap-4 px-5 py-4 xl:grid-cols-[32px_minmax(300px,1.2fr)_170px_220px_160px] xl:items-center">
                    <div className="flex items-start">
                      <input
                        aria-label="Selecionar acordo"
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleOne(row.id)}
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={row.status ?? "quebrado"} />
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${etapaTone(row)}`}>{etapaLabel(row)}</span>
                      </div>
                      <Link href={`/app/acordos/${row.id}`} className="mt-2 block truncate text-sm font-semibold text-slate-950 hover:text-[var(--gkli-primary)]">
                        {row.condominios?.nome ?? "Condomínio não informado"} · Unidade {row.unidades?.identificacao ?? "-"}
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
          </>
        )}
      </Card>
    </div>
  )
}
