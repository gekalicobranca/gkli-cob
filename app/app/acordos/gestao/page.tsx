import Link from 'next/link'
import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  FileText,
  Filter,
  Gavel,
  RotateCcw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react'

import { EmptyState } from '@/components/data/empty-state'
import { StatusBadge } from '@/components/data/status-badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { Select } from '@/components/ui/select'
import { romperAcordoAssistido } from '@/features/acordos/actions'
import { listAcordosQuebradosParaGestao } from '@/features/acordos/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'

type SearchParams = Promise<{
  q?: string
  destino?: string
  status?: string
  ordenar?: string
}>

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeText(value: unknown) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isPreJuridico(row: any) {
  const fluxo = String(row.fluxo_status ?? '').toLowerCase()
  const cobrancaStatus = String(row.cobrancas?.status_operacional ?? row.cobrancas?.status ?? '').toLowerCase()
  return fluxo.includes('pre_juridico') || cobrancaStatus.includes('pre_juridico')
}

function isJudicializado(row: any) {
  const fluxo = String(row.fluxo_status ?? '').toLowerCase()
  const cobrancaStatus = String(row.cobrancas?.status_operacional ?? row.cobrancas?.status ?? '').toLowerCase()
  return fluxo.includes('judicial') || cobrancaStatus.includes('judicial')
}

function isSuspenso(row: any) {
  const fluxo = String(row.fluxo_status ?? '').toLowerCase()
  const cobrancaStatus = String(row.cobrancas?.status_operacional ?? row.cobrancas?.status ?? '').toLowerCase()
  return fluxo.includes('suspender') || fluxo.includes('suspenso') || cobrancaStatus.includes('suspenso')
}

function destinoOperacional(row: any) {
  const fluxo = String(row.fluxo_status ?? '').toLowerCase()
  if (isJudicializado(row)) return 'Judicializado'
  if (isPreJuridico(row)) return 'Pré-jurídico'
  if (isSuspenso(row)) return 'Suspenso'
  if (fluxo.includes('retomar_cobranca')) return 'Retomar cobrança'
  return 'A decidir'
}

function destinoTone(row: any) {
  const destino = destinoOperacional(row)
  if (destino === 'Pré-jurídico') return 'bg-violet-50 text-violet-700'
  if (destino === 'Judicializado') return 'bg-rose-50 text-rose-700'
  if (destino === 'Retomar cobrança') return 'bg-sky-50 text-sky-700'
  if (destino === 'Suspenso') return 'bg-slate-100 text-slate-700'
  return 'bg-amber-50 text-amber-700'
}

function filterRows(rows: any[], params: Awaited<SearchParams>) {
  const termo = normalizeText(params.q)
  const destino = clean(params.destino)
  const status = clean(params.status)

  return rows.filter((row) => {
    if (status && row.status !== status && row.status_financeiro !== status) return false
    if (destino) {
      if (destino === 'pre_juridico' && !isPreJuridico(row)) return false
      if (destino === 'judicializado' && !isJudicializado(row)) return false
      if (destino === 'retomar_cobranca' && !String(row.fluxo_status ?? '').includes('retomar_cobranca')) return false
      if (destino === 'suspenso' && !isSuspenso(row)) return false
      if (destino === 'a_decidir' && destinoOperacional(row) !== 'A decidir') return false
    }

    if (termo) {
      const haystack = normalizeText([
        row.condominios?.nome,
        row.unidades?.identificacao,
        row.unidades?.bloco,
        row.unidades?.responsavel_nome,
        row.status,
        row.status_financeiro,
        row.fluxo_status,
      ].filter(Boolean).join(' '))
      if (!haystack.includes(termo)) return false
    }

    return true
  })
}

function sortRows(rows: any[], ordenar: string) {
  const field = ordenar || 'valor_desc'
  return [...rows].sort((a, b) => {
    if (field === 'valor_asc') return Number(a.valor_risco_operacional ?? a.valor_acordado ?? 0) - Number(b.valor_risco_operacional ?? b.valor_acordado ?? 0)
    if (field === 'data_desc') return new Date(b.data_acordo ?? 0).getTime() - new Date(a.data_acordo ?? 0).getTime()
    if (field === 'data_asc') return new Date(a.data_acordo ?? 0).getTime() - new Date(b.data_acordo ?? 0).getTime()
    if (field === 'destino') return destinoOperacional(a).localeCompare(destinoOperacional(b), 'pt-BR')
    if (field === 'condominio') return normalizeText(a.condominios?.nome).localeCompare(normalizeText(b.condominios?.nome), 'pt-BR')
    return Number(b.valor_risco_operacional ?? b.valor_acordado ?? 0) - Number(a.valor_risco_operacional ?? a.valor_acordado ?? 0)
  })
}

function ActionForm({
  row,
  destino,
  label,
  icon,
  variant = 'secondary',
}: {
  row: any
  destino: 'retomar_cobranca' | 'pre_juridico' | 'judicializar'
  label: string
  icon: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
}) {
  return (
    <form action={romperAcordoAssistido}>
      <input type="hidden" name="acordo_id" value={row.id} />
      <input type="hidden" name="destino" value={destino} />
      <input type="hidden" name="motivo" value="Gestão de acordo quebrado/rompido" />
      <PendingSubmitButton size="sm" variant={variant} icon={icon} pendingLabel="Atualizando...">
        {label}
      </PendingSubmitButton>
    </form>
  )
}

function Kpi({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: React.ElementType }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-[13px] text-slate-500">{detail}</p>
        </div>
        <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
          <Icon size={18} />
        </div>
      </div>
    </Card>
  )
}

export default async function GestaoAcordosPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const baseRows = await listAcordosQuebradosParaGestao(scope)
  const rows = sortRows(filterRows(baseRows, params), clean(params.ordenar))
  const valorTotal = rows.reduce((sum: number, row: any) => sum + Number(row.valor_risco_operacional ?? row.valor_acordado ?? 0), 0)
  const judicializados = rows.filter(isJudicializado)
  const porParcela = rows.filter((row: any) => row.motivo_quebra_parcela)
  const comVincendas = rows.filter((row: any) => row.motivo_quebra_vincendas)
  const aDecidir = rows.filter((row) => destinoOperacional(row) === 'A decidir')
  const hasFilters = Boolean(params.q || params.destino || params.status || params.ordenar)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Acordos"
        title="Gestão de acordos quebrados"
        description="Acordos com parcela fora da janela de reemissão do condomínio ou com cotas vincendas fora do acordo."
        actions={
          <>
            <ButtonLink href="/app/acordos" variant="secondary">Voltar</ButtonLink>
            <ButtonLink href="/app/acordos/rompimentos" variant="secondary">Lista antiga</ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Acordos quebrados" value={String(rows.length)} detail="somente quebras reais" icon={AlertTriangle} />
        <Kpi label="Valor em risco" value={formatCurrency(valorTotal)} detail="acordo mais vincendas fora do acordo" icon={ShieldAlert} />
        <Kpi label="Fora da janela" value={String(porParcela.length)} detail="parcela atrasada além da reemissão" icon={BriefcaseBusiness} />
        <Kpi label="Com vincendas" value={String(comVincendas.length)} detail={`${aDecidir.length} a decidir · ${judicializados.length} judicializado(s)`} icon={Gavel} />
      </section>

      <Card className="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-base font-medium text-slate-950">Fila de decisão</h2>
            <p className="mt-1 text-sm text-slate-500">Filtre acordos quebrados e escolha o próximo destino operacional.</p>
          </div>
          {hasFilters ? (
            <ButtonLink href="/app/acordos/gestao" variant="secondary" size="sm">
              <X size={15} />
              Limpar
            </ButtonLink>
          ) : null}
        </div>

        <form className="mt-4 grid gap-3 xl:grid-cols-[minmax(240px,1fr)_170px_160px_180px_auto] xl:items-end">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Busca</span>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input name="q" defaultValue={clean(params.q)} className="pl-9" placeholder="Condomínio, unidade, responsável..." />
            </div>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Destino</span>
            <Select name="destino" defaultValue={clean(params.destino)}>
              <option value="">Todos</option>
              <option value="a_decidir">A decidir</option>
              <option value="retomar_cobranca">Retomar cobrança</option>
              <option value="pre_juridico">Pré-jurídico</option>
              <option value="judicializado">Judicializado</option>
              <option value="suspenso">Suspenso</option>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Status</span>
            <Select name="status" defaultValue={clean(params.status)}>
              <option value="">Todos</option>
              <option value="quebrado">Quebrado</option>
              <option value="rompido">Rompido</option>
              <option value="vencido">Vencido</option>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Ordenar por</span>
            <Select name="ordenar" defaultValue={clean(params.ordenar) || 'valor_desc'}>
              <option value="valor_desc">Maior valor</option>
              <option value="valor_asc">Menor valor</option>
              <option value="data_desc">Mais recente</option>
              <option value="data_asc">Mais antigo</option>
              <option value="destino">Destino</option>
              <option value="condominio">Condomínio</option>
            </Select>
          </label>
          <Button type="submit">
            <Filter size={16} />
            Filtrar
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Sem acordos quebrados" description="Nenhum acordo com parcela fora da janela ou cotas vincendas fora do acordo foi encontrado neste filtro." />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => {
              const unidadeId = row.unidade_id ?? row.unidades?.id
              return (
                <div key={row.id} className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(320px,1.3fr)_160px_170px_300px] xl:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={row.status} />
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${destinoTone(row)}`}>{destinoOperacional(row)}</span>
                    </div>
                    <Link href={`/app/acordos/${row.id}`} className="mt-2 block truncate text-sm font-semibold text-slate-950 hover:text-[var(--gkli-primary)]">
                      {row.condominios?.nome ?? 'Condomínio não informado'} · Unidade {row.unidades?.identificacao ?? '-'}
                    </Link>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {row.unidades?.responsavel_nome ?? 'Responsável não informado'} · acordo em {formatDateBR(row.data_acordo)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_acordado ?? 0))}</p>
                    {Number(row.valor_vincendas_fora_acordo ?? 0) > 0 ? (
                      <p className="mt-1 text-xs text-slate-500">+ {formatCurrency(Number(row.valor_vincendas_fora_acordo ?? 0))} em vincendas</p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Quebra</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {row.parcelas_fora_janela?.length ? (
                        <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">
                          {row.parcelas_fora_janela[0].dias_atraso}d &gt; {row.parcelas_fora_janela[0].dias_reemissao_permitidos}d
                        </span>
                      ) : null}
                      {row.vincendas_fora_acordo?.length ? (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                          {row.vincendas_fora_acordo.length} vincenda(s)
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {unidadeId ? (
                      <ButtonLink href={`/app/unidades/${unidadeId}/laudo-pre-juridico`} variant="secondary" size="sm">
                        <FileText size={14} />
                        Laudo
                      </ButtonLink>
                    ) : null}
                    <ActionForm row={row} destino="retomar_cobranca" label="Retomar" icon={<RotateCcw size={14} />} />
                    <ActionForm row={row} destino="pre_juridico" label="Pré-jurídico" icon={<BriefcaseBusiness size={14} />} />
                    <ActionForm row={row} destino="judicializar" label="Judicializar" icon={<Gavel size={14} />} variant="danger" />
                    <ButtonLink href={`/app/acordos/${row.id}`} variant="ghost" size="sm">
                      <ArrowUpRight size={14} />
                    </ButtonLink>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
