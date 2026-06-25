import type { ElementType } from 'react'
import { notFound } from 'next/navigation'
import { AlertTriangle, Calculator, ClipboardList, RefreshCcw, TrendingUp, Users, WalletCards } from 'lucide-react'
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

function ReportCard({ title, description, value, icon: Icon }: { title: string; description: string; value: string; icon: ElementType }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
          <p className="mt-3 text-xl font-semibold text-slate-950">{value}</p>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-2 text-[var(--gkli-primary)]"><Icon size={18} /></div>
      </div>
    </Card>
  )
}

export default async function FechamentoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  await requireGestor()
  const { id } = await params
  const periodo = await getFechamentoPeriodo(id)
  if (!periodo) notFound()

  const [resumo, acordos, despesas, operadores, carteiras, faturamentos, auditoria] = await Promise.all([
    getFechamentoResumo(id),
    listFechamentoPagamentos(id),
    listFechamentoDespesas(id),
    listFechamentoOperadores(id),
    listFechamentoCarteiras(id),
    listFechamentoFaturamentosOmie(id),
    listFechamentoAuditoria(id),
  ])

  const podeEditarDatas = !['fechado', 'faturado'].includes(periodo.status)
  const podeApurar = ['rascunho', 'aberto', 'reaberto', 'em_conferencia'].includes(periodo.status)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Fechamento mensal"
        title={`Competência ${formatCompetencia(periodo.competencia)}`}
        description={`Período ${formatDateBR(periodo.data_abertura)} até ${formatDateBR(periodo.data_fechamento)}.`}
        actions={
          <>
            <ButtonLink href="/app/gestao/fechamento" variant="secondary">Voltar</ButtonLink>
            <span className={`inline-flex h-10 items-center rounded-xl px-3 text-sm font-semibold ${statusClass(periodo.status)}`}>{statusLabel[periodo.status] ?? periodo.status}</span>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-5">
        <Kpi title="Acordos realizados" value={String(resumo.acordos)} detail={`Entradas/pagamentos: ${formatCurrency(resumo.valorPago)}`} icon={ClipboardList} />
        <Kpi title="Base x recuperado" value={formatCurrency(resumo.valorRecuperado)} detail={`Base: ${formatCurrency(resumo.valorBaseCobranca)}`} icon={TrendingUp} />
        <Kpi title="Despesas" value={formatCurrency(resumo.despesas)} detail="Repasse por condomínio" icon={Calculator} />
        <Kpi title="Comissão carteira" value={formatCurrency(resumo.comissoes)} detail="Apuração por carteira" icon={WalletCards} />
        <Kpi title="Divergências" value={String(resumo.divergencias)} detail="Para conferência" icon={AlertTriangle} />
      </section>

      <Card className="p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-base font-medium text-slate-950">Processar fechamento</h2>
            <p className="mt-1 text-sm text-slate-500">Apura acordos cujo primeiro pagamento, entrada ou pagamento à vista caiu dentro do período.</p>
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ReportCard title="Acordos no período" value={`${acordos.length} acordo(s)`} description="Lista de acordos pagos à vista, entrada ou primeira parcela." icon={ClipboardList} />
        <ReportCard title="Repasses por condomínio" value={formatCurrency(resumo.despesas)} description={`${despesas.length} agrupamento(s) para despesas de cobrança.`} icon={Calculator} />
        <ReportCard title="Apuração por operador" value={`${operadores.length} operador(es)`} description="Acordos, base, recuperado e despesa à vista/parcelada." icon={Users} />
        <ReportCard title="Comissão por carteira" value={`${carteiras.length} carteira(s)`} description="Base para cálculo da comissão da carteira." icon={WalletCards} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="p-5">
          <h2 className="text-base font-medium text-slate-950">Parâmetros</h2>
          <p className="mt-1 text-sm text-slate-500">A data final pode ser hoje ou uma data anterior informada pelo gestor.</p>
          <form action={atualizarFechamentoPeriodo.bind(null, id)} className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Competência
              <Input name="competencia" type="month" defaultValue={periodo.competencia} disabled={!podeEditarDatas} required className="mt-1" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                De
                <Input name="data_abertura" type="date" defaultValue={periodo.data_abertura} disabled={!podeEditarDatas} required className="mt-1" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Até
                <Input name="data_fechamento" type="date" defaultValue={periodo.data_fechamento} disabled={!podeEditarDatas} required className="mt-1" />
              </label>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Conferência até
              <Input name="data_limite_conferencia" type="date" defaultValue={periodo.data_limite_conferencia ?? ''} disabled={!podeEditarDatas} className="mt-1" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Observações
              <Textarea name="observacoes" rows={4} defaultValue={periodo.observacoes ?? ''} disabled={!podeEditarDatas} className="mt-1" />
            </label>
            {podeEditarDatas && <Button type="submit" className="w-full" variant="secondary">Salvar parâmetros</Button>}
          </form>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 bg-white/80 px-5 py-4">
            <h2 className="text-base font-medium text-slate-950">Acordos realizados no período</h2>
            <p className="mt-1 text-sm text-slate-500">Inclui acordos efetivados por pagamento à vista, entrada ou primeira parcela.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {acordos.length === 0 ? <div className="px-5 py-8 text-sm text-slate-500">Clique em Processar para preencher esta base.</div> : acordos.slice(0, 12).map((row: any) => (
              <div key={row.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_130px_150px_150px] lg:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-950">{row.condominios?.nome ?? 'Condomínio não informado'}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">Unidade {row.unidades?.identificacao ?? '-'} · {row.tipo_pagamento === 'a_vista' ? 'À vista' : 'Parcelado'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Primeiro pagamento</p>
                  <p className="text-sm text-slate-700">{formatDateBR(row.data_pagamento)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Base</p>
                  <p className="text-sm text-slate-700">{formatCurrency(Number(row.valor_base_cobranca ?? 0))}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Recuperado</p>
                  <p className="text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_recuperado ?? row.acordos?.valor_acordado ?? 0))}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="p-5">
          <h2 className="text-base font-medium text-slate-950">Repasses por condomínio</h2>
          <div className="mt-4 space-y-3">
            {despesas.length === 0 ? <p className="text-sm text-slate-500">Sem despesas apuradas.</p> : despesas.slice(0, 8).map((row: any) => (
              <div key={row.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{row.condominios?.nome ?? row.carteiras?.nome ?? 'Agrupamento'}</p><p className="text-xs text-slate-500">Base {formatCurrency(Number(row.valor_base ?? 0))}</p></div>
                <p className="shrink-0 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_despesa ?? 0))}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-medium text-slate-950">Apuração por operador</h2>
          <div className="mt-4 space-y-3">
            {operadores.length === 0 ? <p className="text-sm text-slate-500">Sem operadores apurados.</p> : operadores.slice(0, 8).map((row: any) => (
              <div key={row.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{row.profiles?.nome ?? row.profiles?.email ?? 'Operador'}</p><p className="text-xs text-slate-500">{row.acordos_realizados} acordo(s) · {row.carteiras?.nome ?? 'Carteira'}</p></div>
                  <p className="shrink-0 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_recuperado ?? 0))}</p>
                </div>
                <p className="mt-2 text-xs text-slate-500">Despesa à vista {formatCurrency(Number(row.valor_despesa_a_vista ?? 0))} · parcelado {formatCurrency(Number(row.valor_despesa_parcelado ?? 0))}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-medium text-slate-950">Comissão por carteira</h2>
          <div className="mt-4 space-y-3">
            {carteiras.length === 0 ? <p className="text-sm text-slate-500">Sem carteiras apuradas.</p> : carteiras.slice(0, 8).map((row: any) => (
              <div key={row.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{row.carteiras?.nome ?? 'Carteira'}</p><p className="text-xs text-slate-500">{row.acordos_realizados} acordo(s) · {Number(row.percentual_comissao ?? 0).toFixed(2)}%</p></div>
                <p className="shrink-0 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_comissao ?? 0))}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-base font-medium text-slate-950">Base Omie</h2>
          <div className="mt-4 space-y-3">
            {faturamentos.length === 0 ? <p className="text-sm text-slate-500">Sem base Omie apurada.</p> : faturamentos.slice(0, 8).map((row: any) => (
              <div key={row.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{row.condominios?.nome ?? 'Cliente Omie'}</p><p className="text-xs text-slate-500">Repasse de cobrança extrajudicial</p></div>
                <p className="shrink-0 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_faturamento ?? 0))}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-medium text-slate-950">Auditoria</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {auditoria.length === 0 ? <p className="text-sm text-slate-500">Sem eventos.</p> : auditoria.slice(0, 8).map((evento: any) => (
              <div key={evento.id} className="grid gap-2 py-3 md:grid-cols-[120px_minmax(0,1fr)] md:items-center">
                <p className="text-xs text-slate-500">{formatDateBR(evento.created_at)}</p>
                <div><p className="text-sm font-medium text-slate-800">{evento.descricao}</p><p className="text-xs text-slate-500">{evento.acao}</p></div>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  )
}
