import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { KpiCard } from '@/components/ui/kpi-card'
import { ListKpiGrid } from '@/components/layout/list-page'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import { listAcordos, listParcelasAcordosOperacionais } from '@/features/acordos/queries'
import { tratarPendenciaJudicial, resolverPendenciaJudicial } from '@/features/acordos/judicial-pending-actions'
import type { PendenciaOperacional } from '@/features/pendencias/types'
import { PendenciaActionForm } from '@/app/app/pendencias/pendencia-action-form'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'

export default async function JudicialPendingPage() {
  const scope = await getPermittedCarteiras()
  const [agreements, installments] = await Promise.all([listAcordos(scope, 'judicial'), listParcelasAcordosOperacionais(scope, 'judicial')])
  const byId = new Map(agreements.map(row => [row.id, row]))
  const db = await createClient()
  const pending: PendenciaOperacional[] = []
  // Filter by permitted judicial IDs before pagination; never truncate a mixed queue.
  for (let batch = 0; batch < agreements.length; batch += 100) {
    const ids = agreements.slice(batch, batch + 100).map(row => row.id)
    for (let from = 0; ; from += 1000) {
      const { data, error } = await applyCarteiraScope(db.from('central_pendencias').select('*')
        .in('acordo_id', ids).not('status', 'in', '(resolvida,cancelada)')
        .order('created_at').order('id').range(from, from + 999), scope.carteiraIds)
      if (error) throw new Error(`Erro ao consultar pendências judiciais: ${error.message}`)
      pending.push(...(data ?? []) as PendenciaOperacional[])
      if (!data || data.length < 1000) break
    }
  }
  const overdue = installments.filter(row => row.janela_operacional === 'Em atraso' && !row.data_pagamento && !['paga', 'pago', 'quitada', 'quitado', 'cancelada', 'cancelado'].includes(String(row.status)))
  const missingProcess = agreements.filter(row => !row.numero_processo)
  return <div className="space-y-4">
    <PageHeader eyebrow="Acordos judiciais" title="Pendências judiciais" description="Pendências registradas, parcelas em atraso e processos sem identificação."
      actions={<><ButtonLink href="/app/acordos/judiciais" variant="secondary">Acordos judiciais</ButtonLink><ButtonLink href="/app/acordos/judiciais/fila" variant="secondary">Parcelas e pagamentos</ButtonLink></>} />
    <ListKpiGrid><KpiCard label="Pendências abertas" value={pending.length} /><KpiCard label="Parcelas em atraso" value={overdue.length} /><KpiCard label="Valor em atraso" value={formatCurrency(overdue.reduce((sum, row) => sum + Number(row.valor || 0), 0))} /><KpiCard label="Sem número de processo" value={missingProcess.length} /></ListKpiGrid>
    <Card><h2 className="mb-4 text-lg font-semibold">Pendências registradas</h2>
      {!pending.length && <p className="text-sm text-slate-500">Nenhuma pendência aberta nos acordos judiciais das suas carteiras.</p>}
      <div className="divide-y">{pending.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div><h3 className="font-medium">{row.titulo}</h3><p className="text-sm text-slate-600">Processo {byId.get(row.acordo_id!)?.numero_processo || 'não informado'} · {row.responsavel_nome || 'Sem responsável'} · Prazo {row.prazo_limite ? formatDateBR(row.prazo_limite) : 'não definido'}</p><p className="text-sm text-slate-500">{row.descricao}</p></div>
        <div className="flex flex-wrap gap-2"><ButtonLink href={`/app/acordos/${row.acordo_id}`} variant="secondary">Abrir acordo</ButtonLink>
          {row.tipo !== 'aprovacao_acordo_fora_regua' && <><PendenciaActionForm action={tratarPendenciaJudicial}><input type="hidden" name="id" value={row.id} /><PendingSubmitButton variant="secondary" disabled={row.status === 'em_tratamento'}>Em tratamento</PendingSubmitButton></PendenciaActionForm><PendenciaActionForm action={resolverPendenciaJudicial}><input type="hidden" name="id" value={row.id} /><PendingSubmitButton>Resolver</PendingSubmitButton></PendenciaActionForm></>}
        </div>
      </div>)}</div>
    </Card>
    <Card><h2 className="mb-4 text-lg font-semibold">Parcelas em atraso</h2>
      {!overdue.length && <p className="text-sm text-slate-500">Nenhuma parcela judicial em atraso.</p>}
      <div className="divide-y">{overdue.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><p className="text-sm">Processo {row.acordo?.numero_processo || 'não informado'} · Parcela {row.numero} · {formatDateBR(row.vencimento)} · <strong>{formatCurrency(Number(row.valor))}</strong></p><ButtonLink href={`/app/acordos/judiciais/fila?q=${encodeURIComponent(row.acordo?.numero_processo || row.acordo?.unidades?.identificacao || '')}`} variant="secondary">Conferir pagamento</ButtonLink></div>)}</div>
    </Card>
    {missingProcess.length > 0 && <Card><h2 className="mb-3 text-lg font-semibold">Acordos sem número do processo</h2>{missingProcess.map(row => <p key={row.id} className="py-2"><ButtonLink href={`/app/acordos/${row.id}`} variant="secondary">{row.condominios?.nome} · Unidade {row.unidades?.identificacao}</ButtonLink></p>)}</Card>}
  </div>
}
