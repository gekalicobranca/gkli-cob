import Link from 'next/link'
import { AlertTriangle, ArrowUpRight, Filter, Handshake, Inbox, Plus, Search, BarChart3 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listAcordosComSaude } from '@/features/acordos/queries'
import { AgreementHealthBadge } from '@/features/acordos/components/agreement-health-badge'

function sumBy(rows: any[], predicate: (row: any) => boolean) {
  return rows.filter(predicate).reduce((sum, row) => sum + Number(row.valor_acordado ?? 0), 0)
}

function getUnitLabel(unidade: any) {
  if (!unidade) return 'Unidade não informada'
  const bloco = unidade.bloco ? `Bloco ${unidade.bloco} · ` : ''
  return `${bloco}Unidade ${unidade.identificacao ?? '-'}`
}

function groupAcordos(rows: any[]) {
  const sorted = [...rows].sort((a, b) => {
    const condA = String(a.condominios?.nome ?? '').localeCompare(String(b.condominios?.nome ?? ''), 'pt-BR')
    if (condA !== 0) return condA
    const unitA = String(a.unidades?.identificacao ?? '').localeCompare(String(b.unidades?.identificacao ?? ''), 'pt-BR', { numeric: true })
    if (unitA !== 0) return unitA
    return new Date(b.data_acordo ?? 0).getTime() - new Date(a.data_acordo ?? 0).getTime()
  })

  const groups: Array<{ condominioId: string; condominio: string; acordos: any[] }> = []
  for (const row of sorted) {
    const condominioId = row.condominios?.id ?? 'sem-condominio'
    let group = groups.find((item) => item.condominioId === condominioId)
    if (!group) {
      group = {
        condominioId,
        condominio: row.condominios?.nome ?? 'Condomínio não informado',
        acordos: [],
      }
      groups.push(group)
    }
    group.acordos.push(row)
  }
  return groups
}

export default async function AcordosPage() {
  const scope = await getPermittedCarteiras()
  const rows = await listAcordosComSaude(scope)
  const groups = groupAcordos(rows)

  const ativos = rows.filter((row: any) => row.status === 'ativo').length
  const atraso = rows.filter((row: any) => row.status === 'em atraso').length
  const rompidos = rows.filter((row: any) => row.status === 'rompido').length
  const valorAtivo = sumBy(rows, (row: any) => ['ativo', 'em atraso'].includes(row.status))

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base Operacional"
        title="Acordos"
        description="Controle acordos, parcelas, atrasos e quebras operacionais."
        actions={
          <>
            <ButtonLink href="/app/acordos/fila" variant="secondary"><Inbox size={16} />Fila</ButtonLink>
            <ButtonLink href="/app/acordos/rompimentos" variant="secondary"><AlertTriangle size={16} />Rompimentos</ButtonLink>
            <ButtonLink href="/app/acordos/gestao" variant="secondary"><BarChart3 size={16} />Gestão</ButtonLink>
            <Button variant="secondary"><Filter size={16} />Filtros</Button>
            <ButtonLink href="/app/acordos/novo"><Plus size={16} />Novo acordo</ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><Handshake size={18} /></div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor ativo</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{formatCurrency(valorAtivo)}</p>
          <p className="mt-1 text-sm text-slate-500">ativos ou em atraso</p>
        </Card>
        {[
          ['Ativos', ativos, 'andamento', 'bg-emerald-50 text-emerald-700'],
          ['Em atraso', atraso, 'atenção', 'bg-amber-50 text-amber-700'],
          ['Rompidos', rompidos, 'risco', 'bg-red-50 text-red-700'],
        ].map(([title, value, tag, tagClass]) => (
          <Card key={title} className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{title}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tagClass}`}>{tag}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">status operacional</p>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 bg-white/80 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-base font-medium text-slate-950">Fila de acordos</h2>
              <p className="mt-1 text-sm text-slate-500">Agrupada por condomínio e unidade, com foco na ação operacional.</p>
            </div>
            <div className="grid gap-2 md:grid-cols-[320px_160px_160px]">
              <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Buscar responsável, unidade..." /></div>
              <select className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none"><option>Status</option></select>
              <select className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none"><option>Tipo</option></select>
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-5"><EmptyState title="Nenhum acordo encontrado" description="Crie acordos a partir das cobranças negociadas." /></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {groups.map((group) => (
              <section key={group.condominioId} className="bg-white">
                <div className="flex items-center justify-between gap-3 bg-slate-50/70 px-5 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{group.condominio}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{group.acordos.length} acordo(s)</p>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {group.acordos.map((row: any) => (
                    <Link key={row.id} href={`/app/acordos/${row.id}`} className="group grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1.4fr)_120px_140px_150px_90px] xl:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={row.status} /><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{row.tipo}</span></div>
                        <p className="mt-2 truncate text-sm font-medium text-slate-950">{getUnitLabel(row.unidades)}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{row.unidades?.responsavel_nome ?? 'Responsável não informado'} {row.numero_processo ? `· proc. ${row.numero_processo}` : ''}</p>
                      </div>
                      <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor</p><p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_acordado))}</p></div>
                      <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Saúde</p><div className="mt-1"><AgreementHealthBadge health={row.saude_acordo} /></div></div>
                      <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Data</p><p className="mt-1 text-sm text-slate-700">{formatDateBR(row.data_acordo)}</p></div>
                      <div className="flex justify-end"><ArrowUpRight size={16} className="text-slate-400 group-hover:text-[var(--gkli-primary)]" /></div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
