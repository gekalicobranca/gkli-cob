import {
  AlertTriangle,
  BriefcaseBusiness,
  ClipboardList,
  Filter,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react'
import type { ElementType } from 'react'

import { Button, ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Select } from '@/components/ui/select'
import { listAcordosQuebradosParaGestao } from '@/features/acordos/queries'
import { preJuridicoStepsCompletos } from '@/features/acordos/pre-juridico'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { formatCurrency } from '@/utils/formatters/currency'
import { PreJuridicoWorkbench } from './pre-juridico-workbench'

type SearchParams = Promise<{
  q?: string
  motivo?: string
  etapa?: string
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

function etapaPreparacao(row: any) {
  if (isPreJuridico(row)) return 'encaminhado'
  return preJuridicoStepsCompletos(row.pre_juridico_steps) ? 'pronto' : 'incompleto'
}

function filterRows(rows: any[], params: Awaited<SearchParams>) {
  const termo = normalizeText(params.q)
  const motivo = clean(params.motivo)
  const etapa = clean(params.etapa)

  return rows.filter((row) => {
    if (motivo === 'parcela' && !row.motivo_quebra_parcela) return false
    if (motivo === 'vincendas' && !row.motivo_quebra_vincendas) return false
    if (motivo === 'ambos' && (!row.motivo_quebra_parcela || !row.motivo_quebra_vincendas)) return false

    if (etapa && etapaPreparacao(row) !== etapa) return false

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
    if (field === 'etapa') return etapaPreparacao(a).localeCompare(etapaPreparacao(b), 'pt-BR')
    if (field === 'condominio') return normalizeText(a.condominios?.nome).localeCompare(normalizeText(b.condominios?.nome), 'pt-BR')
    return Number(b.valor_risco_operacional ?? b.valor_acordado ?? 0) - Number(a.valor_risco_operacional ?? a.valor_acordado ?? 0)
  })
}

function Kpi({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: ElementType }) {
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
  const porParcela = rows.filter((row: any) => row.motivo_quebra_parcela)
  const comVincendas = rows.filter((row: any) => row.motivo_quebra_vincendas)
  const prontos = rows.filter((row: any) => etapaPreparacao(row) === 'pronto')
  const encaminhados = rows.filter((row: any) => etapaPreparacao(row) === 'encaminhado')
  const hasFilters = Boolean(params.q || params.motivo || params.etapa || params.ordenar)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Acordos"
        title="Gestão de acordos quebrados"
        description="Fila de acordos com quebra real para preparação documental e encaminhamento ao pré-jurídico."
        actions={
          <>
            <ButtonLink href="/app/acordos" variant="secondary">Voltar</ButtonLink>
            <ButtonLink href="/app/acordos/rompimentos" variant="secondary">Lista antiga</ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Na fila" value={String(rows.length)} detail="acordos quebrados filtrados" icon={AlertTriangle} />
        <Kpi label="Valor em risco" value={formatCurrency(valorTotal)} detail="acordo mais cotas fora do acordo" icon={ShieldAlert} />
        <Kpi label="Fora da janela" value={String(porParcela.length)} detail="parcela além da reemissão" icon={BriefcaseBusiness} />
        <Kpi label="Prontos" value={String(prontos.length)} detail={`${encaminhados.length} já encaminhado(s) · ${comVincendas.length} com vincendas`} icon={ClipboardList} />
      </section>

      <Card className="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-base font-medium text-slate-950">Filtros da fila</h2>
            <p className="mt-1 text-sm text-slate-500">Use os filtros e selecione os acordos que serão tratados em lote.</p>
          </div>
          {hasFilters ? (
            <ButtonLink href="/app/acordos/gestao" variant="secondary" size="sm">
              <X size={15} />
              Limpar
            </ButtonLink>
          ) : null}
        </div>

        <form className="mt-4 grid gap-3 xl:grid-cols-[minmax(240px,1fr)_180px_180px_180px_auto] xl:items-end">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Busca</span>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input name="q" defaultValue={clean(params.q)} className="pl-9" placeholder="Condomínio, unidade, responsável..." />
            </div>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Motivo</span>
            <Select name="motivo" defaultValue={clean(params.motivo)}>
              <option value="">Todos</option>
              <option value="parcela">Parcela atrasada</option>
              <option value="vincendas">Vincendas fora</option>
              <option value="ambos">Ambos</option>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Etapa</span>
            <Select name="etapa" defaultValue={clean(params.etapa)}>
              <option value="">Todas</option>
              <option value="incompleto">Documentos pendentes</option>
              <option value="pronto">Pronto para pré-jurídico</option>
              <option value="encaminhado">Encaminhado</option>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Ordenar por</span>
            <Select name="ordenar" defaultValue={clean(params.ordenar) || 'valor_desc'}>
              <option value="valor_desc">Maior valor</option>
              <option value="valor_asc">Menor valor</option>
              <option value="data_desc">Mais recente</option>
              <option value="data_asc">Mais antigo</option>
              <option value="etapa">Etapa</option>
              <option value="condominio">Condomínio</option>
            </Select>
          </label>
          <Button type="submit">
            <Filter size={16} />
            Filtrar
          </Button>
        </form>
      </Card>

      <PreJuridicoWorkbench rows={rows} />
    </div>
  )
}
