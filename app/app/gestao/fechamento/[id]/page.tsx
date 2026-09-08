import type { ElementType } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, Calculator, ChevronDown, ClipboardList, ReceiptText, RefreshCcw, TrendingUp, Users, WalletCards } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/ui/page-header'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { requireGestor } from '@/utils/auth/require-gestor'
import {
  apurarFechamentoPeriodo,
  abrirPeriodoFechamento,
  atualizarFaturamentoNfse,
  atualizarFechamentoPeriodo,
  cancelarPeriodo,
  enviarPeriodoParaConferencia,
  fecharPeriodo,
  marcarPeriodoComoFaturado,
  reabrirPeriodo,
} from '@/features/fechamento/actions'
import {
  formatCompetencia,
  getFechamentoPeriodo,
  getFechamentoResumo,
  listFechamentoAuditoria,
  listFechamentoCarteiras,
  listFechamentoDespesas,
  listFechamentoFaturamentosOmie,
  listFechamentoOperadores,
  listFechamentoPagamentos,
} from '@/features/fechamento/queries'

const statusLabel: Record<string, string> = {
  rascunho: 'Rascunho',
  aberto: 'Aberto',
  em_conferencia: 'Em conferência',
  fechado: 'Fechado',
  faturado: 'Faturado',
  reaberto: 'Reaberto',
  cancelado: 'Cancelado',
}

function statusClass(status: string) {
  if (status === 'faturado') return 'bg-emerald-50 text-emerald-700'
  if (status === 'fechado') return 'bg-slate-900 text-white'
  if (status === 'em_conferencia') return 'bg-amber-50 text-amber-700'
  if (status === 'aberto' || status === 'reaberto') return 'bg-sky-50 text-sky-700'
  if (status === 'cancelado') return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-600'
}

const nfseStatusLabel: Record<string, string> = {
  pendente_dados: 'Pendente dados',
  pronto_emissao: 'Pronto emissao',
  enviado: 'Enviado',
  autorizado: 'Autorizado',
  erro: 'Erro',
  cancelado: 'Cancelado',
}

function nfseStatusClass(status?: string | null) {
  if (status === 'autorizado') return 'bg-emerald-50 text-emerald-700'
  if (status === 'pronto_emissao') return 'bg-sky-50 text-sky-700'
  if (status === 'enviado') return 'bg-indigo-50 text-indigo-700'
  if (status === 'erro' || status === 'pendente_dados') return 'bg-amber-50 text-amber-700'
  if (status === 'cancelado') return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-600'
}

function hiddenPeriodo(id: string) {
  return <input type="hidden" name="periodo_id" value={id} />
}

function Kpi({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: ElementType }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-[13px] text-slate-500">{detail}</p>
        </div>
        <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><Icon size={18} /></div>
      </div>
    </Card>
  )
}

function relation(value: any) {
  return Array.isArray(value) ? value[0] : value
}

function rowValue(row: any, keys: string[]) {
  for (const key of keys) {
    const value = Number(row?.[key] ?? 0)
    if (Number.isFinite(value) && value !== 0) return value
  }
  return 0
}

function getCarteiraInfo(row: any) {
  const carteira = relation(row?.carteiras)
  return {
    id: String(row?.carteira_id ?? carteira?.id ?? 'sem-carteira'),
    nome: carteira?.nome ?? 'Carteira não informada',
  }
}

function getCondominioInfo(row: any) {
  const condominio = relation(row?.condominios)
  return {
    id: String(row?.condominio_id ?? condominio?.id ?? 'sem-condominio'),
    nome: condominio?.nome ?? 'Condomínio não informado',
  }
}

function groupByCarteiraCondominio<T extends Record<string, any>>(rows: T[], valueKeys: string[] = []) {
  const groups = new Map<string, {
    carteiraId: string
    carteira: string
    condominios: Array<{ condominioId: string; condominio: string; rows: T[]; value: number }>
    rows: T[]
    value: number
  }>()

  for (const row of rows) {
    const carteira = getCarteiraInfo(row)
    const carteiraGroup = groups.get(carteira.id) ?? {
      carteiraId: carteira.id,
      carteira: carteira.nome,
      condominios: [],
      rows: [],
      value: 0,
    }
    const condominio = getCondominioInfo(row)
    let condominioGroup = carteiraGroup.condominios.find((item) => item.condominioId === condominio.id)

    if (!condominioGroup) {
      condominioGroup = { condominioId: condominio.id, condominio: condominio.nome, rows: [], value: 0 }
      carteiraGroup.condominios.push(condominioGroup)
    }

    const value = rowValue(row, valueKeys)
    condominioGroup.rows.push(row)
    condominioGroup.value += value
    carteiraGroup.rows.push(row)
    carteiraGroup.value += value
    groups.set(carteira.id, carteiraGroup)
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      condominios: group.condominios.sort((a, b) => a.condominio.localeCompare(b.condominio, 'pt-BR')),
    }))
    .sort((a, b) => a.carteira.localeCompare(b.carteira, 'pt-BR'))
}

function groupByCarteira<T extends Record<string, any>>(rows: T[], valueKeys: string[] = []) {
  const groups = new Map<string, { carteiraId: string; carteira: string; rows: T[]; value: number }>()

  for (const row of rows) {
    const carteira = getCarteiraInfo(row)
    const group = groups.get(carteira.id) ?? {
      carteiraId: carteira.id,
      carteira: carteira.nome,
      rows: [],
      value: 0,
    }
    const value = rowValue(row, valueKeys)
    group.rows.push(row)
    group.value += value
    groups.set(carteira.id, group)
  }

  return Array.from(groups.values()).sort((a, b) => a.carteira.localeCompare(b.carteira, 'pt-BR'))
}

function HorizontalBlock({
  title,
  description,
  value,
  detail,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string
  description: string
  value?: string
  detail?: string
  icon: ElementType
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <Card className="overflow-hidden p-0">
      <details open={defaultOpen} className="group bg-white">
        <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><Icon size={18} /></div>
                <div className="min-w-0">
                  <h2 className="text-base font-medium text-slate-950">{title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{description}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {value ? (
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-950">{value}</p>
                    {detail ? <p className="mt-0.5 text-xs text-slate-500">{detail}</p> : null}
                  </div>
                ) : null}
                <ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" />
              </div>
            </div>
          </div>
        </summary>
        {children}
      </details>
    </Card>
  )
}

function EmptyBlock({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-4 text-sm text-slate-500">{children}</div>
}

function CarteiraCondominioList<T extends Record<string, any>>({
  rows,
  valueKeys,
  empty,
  children,
}: {
  rows: T[]
  valueKeys?: string[]
  empty: string
  children: (row: T) => React.ReactNode
}) {
  const groups = groupByCarteiraCondominio(rows, valueKeys)

  if (rows.length === 0) return <EmptyBlock>{empty}</EmptyBlock>

  return (
    <div className="divide-y divide-slate-100">
      {groups.map((carteiraGroup) => (
        <details key={carteiraGroup.carteiraId} className="group/carteira bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-y border-slate-200 bg-slate-100/80 px-4 py-3 transition hover:bg-slate-200/70 first:border-t-0 [&::-webkit-details-marker]:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <ChevronDown size={17} className="shrink-0 text-slate-500 transition-transform group-open/carteira:rotate-180" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{carteiraGroup.carteira}</p>
                <p className="mt-0.5 text-xs text-slate-500">{carteiraGroup.condominios.length} condomínio(s) · {carteiraGroup.rows.length} item(ns)</p>
              </div>
            </div>
            {valueKeys?.length ? <p className="shrink-0 text-sm font-semibold text-slate-950">{formatCurrency(carteiraGroup.value)}</p> : null}
          </summary>
          <div className="divide-y divide-slate-100">
            {carteiraGroup.condominios.map((group) => (
              <details key={group.condominioId} className="group/condominio bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-7 py-2.5 transition hover:bg-slate-100/80 [&::-webkit-details-marker]:hidden">
                  <div className="flex min-w-0 items-center gap-3">
                    <ChevronDown size={16} className="shrink-0 text-slate-400 transition-transform group-open/condominio:rotate-180" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{group.condominio}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{group.rows.length} item(ns)</p>
                    </div>
                  </div>
                  {valueKeys?.length ? <p className="shrink-0 text-sm font-semibold text-slate-700">{formatCurrency(group.value)}</p> : null}
                </summary>
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {group.rows.map(children)}
                </div>
              </details>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}

function CarteiraList<T extends Record<string, any>>({
  rows,
  valueKeys,
  empty,
  children,
}: {
  rows: T[]
  valueKeys?: string[]
  empty: string
  children: (row: T) => React.ReactNode
}) {
  const groups = groupByCarteira(rows, valueKeys)

  if (rows.length === 0) return <EmptyBlock>{empty}</EmptyBlock>

  return (
    <div className="divide-y divide-slate-100">
      {groups.map((group) => (
        <details key={group.carteiraId} className="group/carteira bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-y border-slate-200 bg-slate-100/80 px-4 py-3 transition hover:bg-slate-200/70 first:border-t-0 [&::-webkit-details-marker]:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <ChevronDown size={17} className="shrink-0 text-slate-500 transition-transform group-open/carteira:rotate-180" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{group.carteira}</p>
                <p className="mt-0.5 text-xs text-slate-500">{group.rows.length} item(ns)</p>
              </div>
            </div>
            {valueKeys?.length ? <p className="shrink-0 text-sm font-semibold text-slate-950">{formatCurrency(group.value)}</p> : null}
          </summary>
          <div className="divide-y divide-slate-100 border-t border-slate-100">
            {group.rows.map(children)}
          </div>
        </details>
      ))}
    </div>
  )
}

function PagamentoRow({ row }: { row: any }) {
  return (
    <div className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(280px,1fr)_150px_150px_150px] xl:items-center">
      <div className="min-w-0">
        <Link href={row.acordo_id ? `/app/acordos/${row.acordo_id}` : '#'} className="block truncate text-sm font-semibold text-slate-950 hover:text-[var(--gkli-primary)]">
          Unidade {row.unidades?.identificacao ?? '-'} {row.unidades?.bloco ? `· Bloco ${row.unidades.bloco}` : ''}
        </Link>
        <p className="mt-1 truncate text-xs text-slate-500">{row.unidades?.responsavel_nome ?? 'Responsável não informado'} · Parcela {row.parcelas?.numero ?? '-'}</p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Pagamento</p>
        <p className="mt-1 text-sm font-semibold text-slate-950">{formatDateBR(row.data_pagamento)}</p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Pago</p>
        <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_pago ?? 0))}</p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Recuperado</p>
        <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_recuperado ?? 0))}</p>
      </div>
    </div>
  )
}

export default async function FechamentoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  await requireGestor()
  const { id } = await params
  const periodo = await getFechamentoPeriodo(id)
  if (!periodo) notFound()

  const [resumo, pagamentos, despesas, operadores, carteiras, faturamentos, auditoria] = await Promise.all([
    getFechamentoResumo(id),
    listFechamentoPagamentos(id, 200),
    listFechamentoDespesas(id, 200),
    listFechamentoOperadores(id, 200),
    listFechamentoCarteiras(id, 200),
    listFechamentoFaturamentosOmie(id, 200),
    listFechamentoAuditoria(id, 80),
  ])

  const podeEditarDatas = !['fechado', 'faturado'].includes(periodo.status)
  const podeApurar = ['rascunho', 'aberto', 'reaberto', 'em_conferencia'].includes(periodo.status)
  const nfseProntas = faturamentos.filter((row: any) => row.nfse_status === 'pronto_emissao').length
  const nfsePendentes = faturamentos.filter((row: any) => row.nfse_status === 'pendente_dados').length
  const nfseAutorizadas = faturamentos.filter((row: any) => row.nfse_status === 'autorizado').length

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Fechamento mensal"
        title={`Competência ${formatCompetencia(periodo.competencia)}`}
        description={`Período ${formatDateBR(periodo.data_abertura)} até ${formatDateBR(periodo.data_fechamento)}.`}
        actions={
          <>
            <ButtonLink href="/app/gestao/fechamento" variant="secondary">Voltar</ButtonLink>
            <ButtonLink href={`/app/gestao/fechamento/${id}/pagamentos`}>Ver pagamentos</ButtonLink>
            <span className={`inline-flex h-10 items-center rounded-xl px-3 text-sm font-semibold ${statusClass(periodo.status)}`}>{statusLabel[periodo.status] ?? periodo.status}</span>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-5">
        <Kpi title="Pagamentos recebidos" value={String(resumo.pagamentos)} detail={`${resumo.acordos} acordo(s) · ${formatCurrency(resumo.valorPago)}`} icon={ClipboardList} />
        <Kpi title="Base x recuperado" value={formatCurrency(resumo.valorRecuperado)} detail={`Base: ${formatCurrency(resumo.valorBaseCobranca)}`} icon={TrendingUp} />
        <Kpi title="Despesas" value={formatCurrency(resumo.despesas)} detail="Repasse por condomínio" icon={Calculator} />
        <Kpi title="Participação das carteiras" value={formatCurrency(resumo.participacoes)} detail="Sobre o repasse líquido" icon={WalletCards} />
        <Kpi title="Divergências" value={String(resumo.divergencias)} detail="Para conferência" icon={AlertTriangle} />
      </section>

      <Card className="p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-base font-medium text-slate-950">Processar fechamento</h2>
            <p className="mt-1 text-sm text-slate-500">Apura todas as parcelas efetivamente pagas dentro do período, independentemente da data do acordo.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {periodo.status === 'rascunho' && <form action={abrirPeriodoFechamento}>{hiddenPeriodo(id)}<Button type="submit" size="sm">Abrir</Button></form>}
            {podeApurar && <form action={apurarFechamentoPeriodo}>{hiddenPeriodo(id)}<Button type="submit" size="sm"><RefreshCcw size={14} /> Processar</Button></form>}
            {['aberto', 'reaberto'].includes(periodo.status) && <form action={enviarPeriodoParaConferencia}>{hiddenPeriodo(id)}<Button type="submit" size="sm" variant="secondary">Conferência</Button></form>}
            {periodo.status === 'em_conferencia' && <form action={fecharPeriodo}>{hiddenPeriodo(id)}<Button type="submit" size="sm">Fechar</Button></form>}
            {periodo.status === 'fechado' && <form action={marcarPeriodoComoFaturado}>{hiddenPeriodo(id)}<Button type="submit" size="sm">Marcar faturado</Button></form>}
            {['fechado', 'faturado'].includes(periodo.status) && <form action={reabrirPeriodo}>{hiddenPeriodo(id)}<input type="hidden" name="motivo" value="Reabertura solicitada pelo gestor." /><Button type="submit" size="sm" variant="secondary">Reabrir</Button></form>}
            {!['fechado', 'faturado', 'cancelado'].includes(periodo.status) && <form action={cancelarPeriodo}>{hiddenPeriodo(id)}<input type="hidden" name="motivo" value="Cancelado pelo gestor." /><Button type="submit" size="sm" variant="danger">Cancelar</Button></form>}
          </div>
        </div>
      </Card>

      <HorizontalBlock
        title="Parâmetros"
        description="Datas, competência, prazo de conferência e redutor de imposto do fechamento."
        value={formatCompetencia(periodo.competencia)}
        detail={podeEditarDatas ? 'Editável' : 'Bloqueado'}
        icon={Calculator}
      >
        <div className="px-5 py-4">
          <form action={atualizarFechamentoPeriodo.bind(null, id)} className="grid gap-3 xl:grid-cols-4 xl:items-end">
            <label className="block text-sm font-medium text-slate-700">
              Competência
              <Input name="competencia" type="month" defaultValue={periodo.competencia} disabled={!podeEditarDatas} required className="mt-1" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              De
              <Input name="data_abertura" type="date" defaultValue={periodo.data_abertura} disabled={!podeEditarDatas} required className="mt-1" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Até
              <Input name="data_fechamento" type="date" defaultValue={periodo.data_fechamento} disabled={!podeEditarDatas} required className="mt-1" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Conferência até
              <Input name="data_limite_conferencia" type="date" defaultValue={periodo.data_limite_conferencia ?? ''} disabled={!podeEditarDatas} className="mt-1" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Redutor de imposto (%)
              <Input name="percentual_redutor_imposto" type="number" min="0" max="100" step="0.0001" defaultValue={periodo.percentual_redutor_imposto ?? 0} disabled={!podeEditarDatas} required className="mt-1" />
            </label>
            <label className="block text-sm font-medium text-slate-700 xl:col-span-2">
              Observações
              <Textarea name="observacoes" rows={2} defaultValue={periodo.observacoes ?? ''} disabled={!podeEditarDatas} className="mt-1" />
            </label>
            {podeEditarDatas ? <Button type="submit" className="w-full" variant="secondary">Salvar parâmetros</Button> : null}
          </form>
        </div>
      </HorizontalBlock>

      <HorizontalBlock
        title="Recebimentos no período"
        description="Parcelas efetivamente pagas dentro do período, agrupadas por carteira e condomínio."
        value={`${resumo.pagamentos} pagamento(s)`}
        detail={`Referentes a ${resumo.acordos} acordo(s).`}
        icon={ClipboardList}
        defaultOpen={pagamentos.length > 0}
      >
        <CarteiraCondominioList rows={pagamentos as any[]} valueKeys={['valor_pago']} empty="Sem recebimentos apurados.">
          {(row: any) => <PagamentoRow key={row.id} row={row} />}
        </CarteiraCondominioList>
      </HorizontalBlock>

      <HorizontalBlock
        title="Repasses por condomínio"
        description="Despesas de cobrança calculadas por condomínio, agrupadas por carteira."
        value={formatCurrency(resumo.despesas)}
        detail={`${despesas.length} agrupamento(s).`}
        icon={Calculator}
        defaultOpen={despesas.length > 0}
      >
        <CarteiraCondominioList rows={despesas as any[]} valueKeys={['valor_despesa']} empty="Sem despesas apuradas.">
          {(row: any) => (
            <div key={row.id} className="flex items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{row.condominios?.nome ?? row.carteiras?.nome ?? 'Agrupamento'}</p>
                <p className="text-xs text-slate-500">Base {formatCurrency(Number(row.valor_base ?? 0))}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_despesa ?? 0))}</p>
            </div>
          )}
        </CarteiraCondominioList>
      </HorizontalBlock>

      <HorizontalBlock
        title="Apuração por operador"
        description="Acordos, base, recuperado e despesa à vista/parcelada por operador."
        value={`${operadores.length} operador(es)`}
        detail="Agrupado por carteira."
        icon={Users}
        defaultOpen={operadores.length > 0}
      >
        <CarteiraList rows={operadores as any[]} valueKeys={['valor_recuperado']} empty="Sem operadores apurados.">
          {(row: any) => (
            <div key={row.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{row.profiles?.nome ?? row.profiles?.email ?? 'Operador'}</p>
                  <p className="text-xs text-slate-500">{row.acordos_realizados} pagamento(s) · {row.carteiras?.nome ?? 'Carteira'}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_recuperado ?? 0))}</p>
              </div>
              <p className="mt-2 text-xs text-slate-500">Despesa à vista {formatCurrency(Number(row.valor_despesa_a_vista ?? 0))} · parcelado {formatCurrency(Number(row.valor_despesa_parcelado ?? 0))}</p>
            </div>
          )}
        </CarteiraList>
      </HorizontalBlock>

      <HorizontalBlock
        title="Participação por carteira"
        description="Repasse, imposto, líquido e participação final de cada carteira."
        value={formatCurrency(resumo.participacoes)}
        detail="Sobre o repasse líquido."
        icon={WalletCards}
        defaultOpen={carteiras.length > 0}
      >
        <CarteiraList rows={carteiras as any[]} valueKeys={['valor_participacao']} empty="Sem carteiras apuradas.">
          {(row: any) => (
            <div key={row.id} className="flex items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{row.carteiras?.nome ?? 'Carteira'}</p>
                <p className="text-xs text-slate-500">Repasse {formatCurrency(Number(row.valor_repasse ?? 0))} · imposto {Number(row.percentual_redutor_imposto ?? 0).toFixed(2)}% ({formatCurrency(Number(row.valor_redutor_imposto ?? 0))}) · líquido {formatCurrency(Number(row.valor_repasse_liquido ?? 0))} · participação {Number(row.percentual_participacao ?? 0).toFixed(2)}%</p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_participacao ?? 0))}</p>
            </div>
          )}
        </CarteiraList>
      </HorizontalBlock>

      <HorizontalBlock
        title="Base NFS-e"
        description="Notas fiscais por carteira e condomínio, com registro de emissão no próprio item."
        value={`${faturamentos.length} nota(s)`}
        detail={`${nfseProntas} pronta(s), ${nfsePendentes} pendente(s), ${nfseAutorizadas} autorizada(s).`}
        icon={ReceiptText}
        defaultOpen={faturamentos.length > 0}
      >
        <CarteiraCondominioList rows={faturamentos as any[]} valueKeys={['valor_faturamento']} empty="Sem base fiscal apurada.">
          {(row: any) => (
            <div key={row.id} className="flex items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-slate-800">{row.tomador_razao_social ?? row.condominios?.nome ?? 'Tomador'}</p>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${nfseStatusClass(row.nfse_status)}`}>{nfseStatusLabel[row.nfse_status] ?? row.nfse_status ?? 'Pendente'}</span>
                </div>
                <p className="text-xs text-slate-500">Emissor {row.emissor_cnpj ?? row.carteiras?.nfse_emissor_cnpj ?? '-'} · Serviço {row.nfse_codigo_servico ?? '-'}</p>
                {Array.isArray(row.nfse_pendencias) && row.nfse_pendencias.length > 0 ? (
                  <p className="text-xs text-amber-700">Pendências: {row.nfse_pendencias.join(', ')}</p>
                ) : (
                  <p className="text-xs text-slate-500">Repasse de cobrança extrajudicial pronto para emissão.</p>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--gkli-primary)]">Registrar emissão</summary>
                  <form action={atualizarFaturamentoNfse} className="mt-3 grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 md:grid-cols-2">
                    <input type="hidden" name="periodo_id" value={id} />
                    <input type="hidden" name="faturamento_id" value={row.id} />
                    <label className="text-xs font-medium text-slate-600">
                      Status
                      <select name="nfse_status" defaultValue={row.nfse_status ?? 'pendente_dados'} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800">
                        <option value="pendente_dados">Pendente dados</option>
                        <option value="pronto_emissao">Pronto emissão</option>
                        <option value="enviado">Enviado</option>
                        <option value="autorizado">Autorizado</option>
                        <option value="erro">Erro</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      Número NFS-e
                      <Input name="nfse_numero" defaultValue={row.nfse_numero ?? ''} className="mt-1" />
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      Código verificação
                      <Input name="nfse_codigo_verificacao" defaultValue={row.nfse_codigo_verificacao ?? ''} className="mt-1" />
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      RPS
                      <div className="mt-1 grid gap-2 sm:grid-cols-2">
                        <Input name="nfse_rps_numero" defaultValue={row.nfse_rps_numero ?? ''} placeholder="Número" />
                        <Input name="nfse_rps_serie" defaultValue={row.nfse_rps_serie ?? ''} placeholder="Série" />
                      </div>
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      PDF NFS-e
                      <Input name="nfse_pdf_url" defaultValue={row.nfse_pdf_url ?? ''} className="mt-1" placeholder="URL do PDF" />
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      XML NFS-e
                      <Input name="nfse_xml_url" defaultValue={row.nfse_xml_url ?? ''} className="mt-1" placeholder="URL do XML" />
                    </label>
                    <label className="text-xs font-medium text-slate-600 md:col-span-2">
                      Demonstrativo
                      <Input name="demonstrativo_pdf_url" defaultValue={row.demonstrativo_pdf_url ?? ''} className="mt-1" placeholder="URL do demonstrativo" />
                    </label>
                    <label className="text-xs font-medium text-slate-600 md:col-span-2">
                      Erro/observação fiscal
                      <Input name="nfse_erro" defaultValue={row.nfse_erro ?? ''} className="mt-1" />
                    </label>
                    <div className="md:col-span-2">
                      <Button type="submit" size="sm" variant="secondary">Salvar NFS-e</Button>
                    </div>
                  </form>
                </details>
              </div>
              <p className="shrink-0 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_faturamento ?? 0))}</p>
            </div>
          )}
        </CarteiraCondominioList>
      </HorizontalBlock>

      <HorizontalBlock
        title="Auditoria"
        description="Eventos de processamento e alterações do período."
        value={`${auditoria.length} evento(s)`}
        icon={AlertTriangle}
        defaultOpen={auditoria.length > 0}
      >
        <div className="divide-y divide-slate-100">
          {auditoria.length === 0 ? <EmptyBlock>Sem eventos.</EmptyBlock> : auditoria.map((evento: any) => (
            <div key={evento.id} className="grid gap-2 px-5 py-4 md:grid-cols-[120px_minmax(0,1fr)] md:items-center">
              <p className="text-xs text-slate-500">{formatDateBR(evento.created_at)}</p>
              <div><p className="text-sm font-medium text-slate-800">{evento.descricao}</p><p className="text-xs text-slate-500">{evento.acao}</p></div>
            </div>
          ))}
        </div>
      </HorizontalBlock>
    </div>
  )
}
