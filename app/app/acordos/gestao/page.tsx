import Link from 'next/link'
import { AlertTriangle, ArrowUpRight, Banknote, FileText, Handshake, Inbox, ReceiptText, TrendingUp } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { formatCurrency } from '@/utils/formatters/currency'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getAgreementPerformance, listAgreementExceptionInbox } from '@/features/acordos/queries'

function Kpi({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: React.ElementType }) {
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

export default async function GestaoAcordosPage() {
  const scope = await getPermittedCarteiras()
  const [metrics, exceptions] = await Promise.all([
    getAgreementPerformance(scope),
    listAgreementExceptionInbox(scope),
  ])

  const topExceptions = exceptions.slice(0, 5)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Acordos"
        title="Gestão de acordos"
        description="KPIs e exceções para acompanhar recuperação sem carregar a operação com telas pesadas."
        actions={
          <>
            <ButtonLink href="/app/acordos" variant="secondary">Voltar</ButtonLink>
            <ButtonLink href="/app/acordos/excecoes" variant="secondary"><Inbox size={16} />Exceções</ButtonLink>
            <ButtonLink href="/app/acordos/aprovacoes" variant="secondary">Aprovações</ButtonLink>
            <ButtonLink href="/app/acordos/boletos" variant="secondary">Boletos</ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Kpi title="Ativos" value={String(metrics.acordosAtivos)} detail="em acompanhamento" icon={Handshake} />
        <Kpi title="Efetivados" value={String(metrics.acordosEfetivados)} detail={`${metrics.taxaEfetivacao}% de efetivação`} icon={TrendingUp} />
        <Kpi title="Rompidos" value={String(metrics.acordosRompidos)} detail="exigem decisão operacional" icon={AlertTriangle} />
        <Kpi title="Acordado" value={formatCurrency(metrics.valorAcordado)} detail="valor total negociado" icon={Banknote} />
        <Kpi title="Recuperado" value={formatCurrency(metrics.valorRecuperado)} detail={`${metrics.taxaRecuperacao}% do valor acordado`} icon={ReceiptText} />
        <Kpi title="Saldo aberto" value={formatCurrency(metrics.saldoAberto)} detail="acordado ainda não recebido" icon={FileText} />
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Boletos pendentes</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{metrics.boletosPendentes}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Aprovações</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{metrics.aprovacoesPendentes}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Aceites</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{metrics.aceitesPendentes}</p>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-medium text-slate-950">Exceções prioritárias</h2>
            <p className="mt-1 text-sm text-slate-500">Somente itens que pedem decisão da coordenação.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {topExceptions.length === 0 ? (
              <div className="px-5 py-6 text-sm text-slate-500">Nenhuma exceção relevante agora.</div>
            ) : topExceptions.map((item) => (
              <Link key={item.id} href={`/app/acordos/${item.acordoId}`} className="group grid gap-3 px-5 py-4 transition hover:bg-slate-50 md:grid-cols-[1fr_130px_32px] md:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{item.tipo}</span>
                    <span className={item.prioridade === 'Alta' ? 'rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700' : 'rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700'}>{item.prioridade}</span>
                  </div>
                  <p className="mt-2 truncate text-sm font-medium text-slate-950">{item.titulo}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{item.descricao}</p>
                </div>
                <p className="text-sm font-semibold text-slate-950">{formatCurrency(item.valor)}</p>
                <ArrowUpRight size={16} className="text-slate-400 group-hover:text-[var(--gkli-primary)]" />
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-base font-medium text-slate-950">Relatórios</h2>
          <p className="mt-1 text-sm text-slate-500">Leituras sintéticas com detalhe e impressão.</p>
          <div className="mt-4 space-y-2">
            <ButtonLink href="/app/relatorios/acordos-recuperacao" variant="secondary" className="w-full justify-start"><FileText size={16} />Recuperação</ButtonLink>
            <ButtonLink href="/app/relatorios/acordos-rompimentos" variant="secondary" className="w-full justify-start"><AlertTriangle size={16} />Rompimentos</ButtonLink>
            <ButtonLink href="/app/acordos/aprovacoes" variant="secondary" className="w-full justify-start"><FileText size={16} />Aprovações</ButtonLink>
            <ButtonLink href="/app/acordos/boletos" variant="secondary" className="w-full justify-start"><ReceiptText size={16} />Boletos</ButtonLink>
          </div>
        </Card>
      </section>
    </div>
  )
}
