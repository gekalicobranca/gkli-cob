import { ArrowLeft, ArrowUpRight, FileText } from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { ListEmptyState, ListPanel, ListPanelHeader, ListRow, ListRows, ListTitle } from '@/components/layout/list-page'
import { PageHeader } from '@/components/ui/page-header'
import { listCobrancasAgrupadasPreJuridico } from '@/features/pre-juridico/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { formatCurrency } from '@/utils/formatters/currency'

type Params = Promise<{ ids?: string }>

export default async function LaudosGeradosPage({ searchParams }: { searchParams: Params }) {
  const { ids: rawIds } = await searchParams
  const ids = Array.from(new Set(String(rawIds ?? '').split(',').map((id) => id.trim()).filter(Boolean)))
  const scope = await getPermittedCarteiras()
  const rows = await listCobrancasAgrupadasPreJuridico(scope, ids)
  const groups = new Map<string, any[]>()
  for (const row of rows) {
    const key = row.unidade_id || row.id
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  return <div className="space-y-3">
    <PageHeader eyebrow="Pré-Jurídico · Processamento" title="Laudos gerados" description="Abra e confira os laudos. Os casos agora aguardam a certidão para confirmar a propriedade." actions={<ButtonLink href="/app/pre-juridico/processamento" variant="secondary"><ArrowLeft size={16} />Voltar ao processamento</ButtonLink>} />
    <ListPanel>
      <ListPanelHeader><ListTitle title="Laudos por unidade" description={`${groups.size} laudo(s) preparado(s) a partir de ${rows.length} cobrança(s).`} /></ListPanelHeader>
      {groups.size ? <ListRows>{Array.from(groups.entries()).map(([unidadeId, cobrancas]) => {
        const first = cobrancas[0]
        const params = new URLSearchParams()
        for (const cobranca of cobrancas) params.append('cobrancaIds', cobranca.id)
        const href = `/app/unidades/${unidadeId}/laudo-pre-juridico?${params.toString()}`
        const total = cobrancas.reduce((sum: number, row: any) => sum + Number(row.valor_atualizado ?? row.valor_original ?? 0), 0)
        return <ListRow key={unidadeId} className="xl:grid-cols-[minmax(300px,1fr)_140px_150px_auto]">
          <div className="flex items-start gap-3"><div className="rounded-lg bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><FileText size={17} /></div><div><p className="text-sm font-semibold text-slate-950">{first.condominio?.nome_operacional || first.condominio?.nome || 'Condomínio'}</p><p className="mt-1 text-xs text-slate-500">Unidade {first.unidade?.identificacao || '-'} · {first.unidade?.responsavel_nome || 'Responsável não informado'}</p></div></div>
          <div><p className="text-xs text-slate-400">Cobranças</p><p className="mt-1 text-sm font-semibold">{cobrancas.length}</p></div>
          <div><p className="text-xs text-slate-400">Valor</p><p className="mt-1 text-sm font-semibold">{formatCurrency(total)}</p></div>
          <ButtonLink href={href} variant="secondary" size="sm" target="_blank">Abrir laudo<ArrowUpRight size={14} /></ButtonLink>
        </ListRow>
      })}</ListRows> : <ListEmptyState title="Nenhum laudo encontrado" description="As cobranças informadas não estão disponíveis no seu escopo." />}
    </ListPanel>
  </div>
}
