import Link from 'next/link'
import { CheckCircle2, MailCheck, ReceiptText, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/data/empty-state'
import { AgreementHealthBadge } from '@/features/acordos/components/agreement-health-badge'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listAgreementBoletoInbox } from '@/features/acordos/queries'
import { atualizarStatusBoletosAcordo } from '@/features/acordos/actions'

function etapaClass(etapa: string) {
  if (etapa === 'Boletos enviados') return 'bg-emerald-50 text-emerald-700'
  if (etapa === 'Boletos recebidos') return 'bg-sky-50 text-sky-700'
  return 'bg-amber-50 text-amber-700'
}

export default async function BoletosAcordosPage() {
  const scope = await getPermittedCarteiras()
  const rows = await listAgreementBoletoInbox(scope)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Acordos"
        title="Controle de boletos"
        description="Acompanhamento simples: aguardando, recebidos e enviados ao devedor."
        actions={
          <>
            <ButtonLink href="/app/acordos/gestao" variant="secondary">Voltar</ButtonLink>
            <ButtonLink href="/app/acordos/aprovacoes" variant="secondary">Aprovações</ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-3">
        {['Aguardando boletos', 'Boletos recebidos', 'Boletos enviados'].map((etapa) => (
          <Card key={etapa} className="p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{etapa}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{rows.filter((row: any) => row.etapa_boleto === etapa).length}</p>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 bg-white/80 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><ReceiptText size={18} /></div>
              <div>
                <h2 className="text-base font-medium text-slate-950">Boletos de acordos</h2>
                <p className="mt-1 text-sm text-slate-500">Atualize o estágio sem abrir workflow pesado.</p>
              </div>
            </div>
            <div className="relative w-full xl:w-[340px]"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Buscar na página" /></div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-5"><EmptyState title="Sem boletos em acompanhamento" description="Nenhum acordo está aguardando boletos agora." /></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => (
              <div key={row.id} className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(320px,1fr)_140px_130px_240px] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${etapaClass(row.etapa_boleto)}`}>{row.etapa_boleto}</span>
                    <AgreementHealthBadge health={row.saude_acordo} />
                  </div>
                  <Link href={`/app/acordos/${row.id}`} className="mt-2 block truncate text-sm font-medium text-slate-950 hover:text-[var(--gkli-primary)]">{row.condominios?.nome ?? 'Condomínio não informado'} · Unidade {row.unidades?.identificacao ?? '-'}</Link>
                  <p className="mt-1 truncate text-xs text-slate-500">{row.unidades?.responsavel_nome ?? 'Responsável não informado'} · solicitado em {formatDateBR(row.boletos_solicitados_em)}</p>
                </div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Acordo</p><p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_acordado ?? 0))}</p></div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Data</p><p className="mt-1 text-sm text-slate-700">{formatDateBR(row.data_acordo)}</p></div>
                <form action={atualizarStatusBoletosAcordo} className="flex flex-wrap justify-end gap-2">
                  <input type="hidden" name="acordo_id" value={row.id} />
                  <PendingSubmitButton name="status_boletos" value="boletos_recebidos" variant="secondary" size="sm" className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100" icon={<CheckCircle2 size={14} />} pendingLabel="Confirmando...">
                    Recebidos
                  </PendingSubmitButton>
                  <PendingSubmitButton name="status_boletos" value="boletos_enviados" size="sm" className="bg-emerald-600 hover:bg-emerald-700" icon={<MailCheck size={14} />} pendingLabel="Confirmando...">
                    Enviados
                  </PendingSubmitButton>
                </form>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
