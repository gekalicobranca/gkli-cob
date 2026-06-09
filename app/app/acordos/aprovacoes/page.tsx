import Link from 'next/link'
import { CheckCircle2, XCircle, Search, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/data/empty-state'
import { AgreementHealthBadge } from '@/features/acordos/components/agreement-health-badge'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listAgreementApprovalInbox } from '@/features/acordos/queries'
import { decidirAprovacaoSindicoAcordo } from '@/features/acordos/actions'

export default async function AprovacoesAcordosPage() {
  const scope = await getPermittedCarteiras()
  const rows = await listAgreementApprovalInbox(scope)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Acordos"
        title="Aprovações"
        description="Fila leve de acordos que dependem de aprovação do síndico."
        actions={
          <>
            <ButtonLink href="/app/acordos/gestao" variant="secondary">Voltar</ButtonLink>
            <ButtonLink href="/app/acordos/boletos" variant="secondary">Boletos</ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Pendentes</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{rows.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor em aprovação</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{formatCurrency(rows.reduce((sum: number, row: any) => sum + Number(row.valor_acordado ?? 0), 0))}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Críticos</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{rows.filter((row: any) => row.saude_acordo === 'critico').length}</p>
        </Card>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 bg-white/80 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><ShieldCheck size={18} /></div>
              <div>
                <h2 className="text-base font-medium text-slate-950">Decisão do síndico</h2>
                <p className="mt-1 text-sm text-slate-500">Aprovar ou rejeitar sem abrir telas adicionais.</p>
              </div>
            </div>
            <div className="relative w-full xl:w-[340px]"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Buscar na página" /></div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-5"><EmptyState title="Sem aprovações pendentes" description="Nenhum acordo depende de aprovação do síndico agora." /></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => (
              <div key={row.id} className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(320px,1fr)_140px_120px_280px] xl:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">{row.etapa_aprovacao}</span>
                    <AgreementHealthBadge health={row.saude_acordo} />
                  </div>
                  <Link href={`/app/acordos/${row.id}`} className="mt-2 block truncate text-sm font-medium text-slate-950 hover:text-[var(--gkli-primary)]">{row.condominios?.nome ?? 'Condomínio não informado'} · Unidade {row.unidades?.identificacao ?? '-'}</Link>
                  <p className="mt-1 truncate text-xs text-slate-500">{row.unidades?.responsavel_nome ?? 'Responsável não informado'} · {formatDateBR(row.data_acordo)}</p>
                </div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Acordo</p><p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_acordado ?? 0))}</p></div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Parcelas</p><p className="mt-1 text-sm text-slate-700">{row.quantidade_parcelas ?? '-'}</p></div>
                <form action={decidirAprovacaoSindicoAcordo} className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <input type="hidden" name="acordo_id" value={row.id} />
                  <Select name="motivo" defaultValue="">
                    <option value="">Motivo, se rejeitar</option>
                    <option value="Quantidade de parcelas">Quantidade de parcelas</option>
                    <option value="Entrada insuficiente">Entrada insuficiente</option>
                    <option value="Pendência documental">Pendência documental</option>
                    <option value="Unidade judicializada">Unidade judicializada</option>
                    <option value="Outro">Outro</option>
                  </Select>
                  <Textarea name="observacao" placeholder="Observação opcional" className="min-h-[72px]" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <PendingSubmitButton name="decisao" value="aprovar" size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700" icon={<CheckCircle2 size={14} />} pendingLabel="Aprovando...">
                      Aprovar
                    </PendingSubmitButton>
                    <PendingSubmitButton name="decisao" value="rejeitar" variant="secondary" size="sm" className="w-full border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" icon={<XCircle size={14} />} pendingLabel="Rejeitando...">
                      Rejeitar
                    </PendingSubmitButton>
                  </div>
                </form>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
