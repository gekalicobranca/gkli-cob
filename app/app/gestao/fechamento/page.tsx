import Link from 'next/link'
import { CalendarDays, FileSpreadsheet, LockKeyhole, Plus, ReceiptText } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ListKpiGrid } from '@/components/layout/list-page'
import { Button } from '@/components/ui/button'
import { ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { requireGestor } from '@/utils/auth/require-gestor'
import { criarFechamentoPeriodo } from '@/features/fechamento/actions'
import { formatCompetencia, getFechamentoPeriodoDefaults, listFechamentoPeriodos } from '@/features/fechamento/queries'

function statusClass(status: string) {
  if (status === 'faturado') return 'bg-emerald-50 text-emerald-700'
  if (status === 'fechado') return 'bg-slate-900 text-white'
  if (status === 'em_conferencia') return 'bg-amber-50 text-amber-700'
  if (status === 'aberto' || status === 'reaberto') return 'bg-sky-50 text-sky-700'
  if (status === 'cancelado') return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-600'
}

export default async function FechamentoMensalPage() {
  await requireGestor()
  const [periodos, defaults] = await Promise.all([
    listFechamentoPeriodos(),
    getFechamentoPeriodoDefaults(),
  ])

  const aberto = periodos.filter((periodo) => ['aberto', 'reaberto', 'em_conferencia'].includes(periodo.status)).length
  const faturado = periodos.filter((periodo) => periodo.status === 'faturado').length
  const totalFiscal = periodos.reduce((sum, periodo) => sum + Number(periodo.total_faturamento_omie ?? 0), 0)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Gestão"
        title="Fechamento mensal"
        description="Processamento dos pagamentos recebidos na competência, repasses de despesas, apuração por operador, participação por carteira e base fiscal para NFS-e."
        actions={<ButtonLink href="/app/gestao" variant="secondary">Voltar</ButtonLink>}
      />

      <ListKpiGrid className="xl:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Em andamento</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{aberto}</p>
            </div>
            <CalendarDays size={18} className="text-[var(--gkli-primary)]" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Faturados</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{faturado}</p>
            </div>
            <LockKeyhole size={18} className="text-[var(--gkli-primary)]" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Base NFS-e</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{formatCurrency(totalFiscal)}</p>
            </div>
            <ReceiptText size={18} className="text-[var(--gkli-primary)]" />
          </div>
        </Card>
      </ListKpiGrid>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 bg-white/80 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><FileSpreadsheet size={18} /></div>
              <div>
                <h2 className="text-base font-medium text-slate-950">Períodos</h2>
                <p className="mt-1 text-sm text-slate-500">Abra, processe, confira, feche e marque como faturado.</p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {periodos.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500">Nenhum período criado ainda.</div>
            ) : periodos.map((periodo) => (
              <Link
                key={periodo.id}
                href={`/app/gestao/fechamento/${periodo.id}`}
                className="grid gap-3 px-5 py-4 transition hover:bg-slate-50 lg:grid-cols-[170px_minmax(0,1fr)_190px_150px] lg:items-center"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-950">{formatCompetencia(periodo.competencia)}</p>
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(periodo.status)}`}>{periodo.status.replace('_', ' ')}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-slate-700">{formatDateBR(periodo.data_abertura)} até {formatDateBR(periodo.data_fechamento)}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">Conferência até {formatDateBR(periodo.data_limite_conferencia)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Repasse / Participação</p>
                  <p className="text-sm font-medium text-slate-800">{formatCurrency(Number(periodo.total_despesas_cobranca ?? 0))} · {formatCurrency(Number(periodo.total_comissoes ?? 0))}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">NFS-e</p>
                  <p className="text-sm font-semibold text-slate-950">{formatCurrency(Number(periodo.total_faturamento_omie ?? 0))}</p>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><Plus size={18} /></div>
            <div>
              <h2 className="text-base font-medium text-slate-950">Novo fechamento</h2>
              <p className="mt-1 text-sm text-slate-500">Abertura sugerida pelo D+1 do fechamento anterior.</p>
            </div>
          </div>

          <form action={criarFechamentoPeriodo} className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Competência
              <Input name="competencia" type="month" defaultValue={defaults.competencia} required className="mt-1" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                De
                <Input name="data_abertura" type="date" defaultValue={defaults.dataAbertura} required className="mt-1" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Até
                <Input name="data_fechamento" type="date" defaultValue={defaults.dataFechamento} required className="mt-1" />
              </label>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Conferência até
              <Input name="data_limite_conferencia" type="date" className="mt-1" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Redutor de imposto (%)
              <Input name="percentual_redutor_imposto" type="number" min="0" max="100" step="0.0001" defaultValue="0" required className="mt-1" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Observações
              <Textarea name="observacoes" rows={3} className="mt-1" placeholder="Critérios, exceções ou orientação da competência." />
            </label>
            <Button type="submit" className="w-full">Criar fechamento</Button>
          </form>
        </Card>
      </section>
    </div>
  )
}
