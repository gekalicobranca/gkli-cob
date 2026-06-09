import Link from 'next/link'
import { AlertTriangle, ArrowUpRight, Handshake, Inbox, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listAcordosComSaude } from '@/features/acordos/queries'
import { AgreementHealthBadge } from '@/features/acordos/components/agreement-health-badge'

type AcordosPageProps = {
  searchParams?: Promise<{
    q?: string
    status?: string
    tipo?: string
    data_de?: string
    data_ate?: string
    ordenar?: string
  }>
}

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeText(value: unknown) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function dateFilter(value: unknown) {
  const text = clean(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function sumBy(rows: any[], predicate: (row: any) => boolean) {
  return rows.filter(predicate).reduce((sum, row) => sum + Number(row.valor_acordado ?? 0), 0)
}

function getUnitLabel(unidade: any) {
  if (!unidade) return 'Unidade não informada'
  const bloco = unidade.bloco ? `Bloco ${unidade.bloco} · ` : ''
  return `${bloco}Unidade ${unidade.identificacao ?? '-'}`
}

function getComparable(row: any, field: string) {
  if (field === 'data_asc' || field === 'data_desc') return new Date(row.data_acordo ?? 0).getTime()
  if (field === 'valor_asc' || field === 'valor_desc') return Number(row.valor_acordado ?? 0)
  if (field === 'condominio') return normalizeText(row.condominios?.nome)
  if (field === 'unidade') return normalizeText(row.unidades?.identificacao)
  if (field === 'responsavel') return normalizeText(row.unidades?.responsavel_nome)
  if (field === 'status') return normalizeText(row.status)
  return normalizeText(row.condominios?.nome)
}

function sortAcordos(rows: any[], ordenar: string) {
  return [...rows].sort((a, b) => {
    const field = ordenar || 'condominio'
    const av = getComparable(a, field)
    const bv = getComparable(b, field)

    if (typeof av === 'number' && typeof bv === 'number') {
      return field.endsWith('_desc') ? bv - av : av - bv
    }

    const result = String(av).localeCompare(String(bv), 'pt-BR', { numeric: true })
    if (result !== 0) return result

    return String(a.unidades?.identificacao ?? '').localeCompare(String(b.unidades?.identificacao ?? ''), 'pt-BR', { numeric: true })
  })
}

function filterAcordos(rows: any[], filters: Awaited<NonNullable<AcordosPageProps['searchParams']>>) {
  const termo = normalizeText(filters.q)
  const status = clean(filters.status)
  const tipo = clean(filters.tipo)
  const dataDe = dateFilter(filters.data_de)
  const dataAte = dateFilter(filters.data_ate)

  return rows.filter((row) => {
    const data = clean(row.data_acordo).slice(0, 10)
    if (status && row.status !== status) return false
    if (tipo && row.tipo !== tipo) return false
    if (dataDe && data < dataDe) return false
    if (dataAte && data > dataAte) return false

    if (termo) {
      const haystack = normalizeText([
        row.condominios?.nome,
        row.unidades?.identificacao,
        row.unidades?.bloco,
        row.unidades?.responsavel_nome,
        row.numero_processo,
        row.status,
        row.tipo,
      ].filter(Boolean).join(' '))
      if (!haystack.includes(termo)) return false
    }

    return true
  })
}

function groupAcordos(rows: any[]) {
  const groups: Array<{ condominioId: string; condominio: string; acordos: any[] }> = []
  for (const row of rows) {
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

export default async function AcordosPage({ searchParams }: AcordosPageProps) {
  const params = searchParams ? await searchParams : {}
  const scope = await getPermittedCarteiras()
  const allRows = await listAcordosComSaude(scope)
  const rows = sortAcordos(filterAcordos(allRows, params), clean(params.ordenar) || 'condominio')
  const groups = groupAcordos(rows)
  const hasFilters = Boolean(params.q || params.status || params.tipo || params.data_de || params.data_ate || params.ordenar)

  const ativos = rows.filter((row: any) => row.status === 'ativo').length
  const atraso = rows.filter((row: any) => row.status === 'em atraso').length
  const rompidos = rows.filter((row: any) => row.status === 'rompido').length
  const valorAtivo = sumBy(rows, (row: any) => ['ativo', 'em atraso'].includes(row.status))

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Base Operacional"
        title="Acordos"
        description="Controle acordos, parcelas, atrasos e quebras operacionais."
        actions={
          <>
            <ButtonLink href="/app/acordos/fila" variant="secondary"><Inbox size={16} />Fila</ButtonLink>
            <ButtonLink href="/app/acordos/rompimentos" variant="secondary"><AlertTriangle size={16} />Rompimentos</ButtonLink>
          </>
        }
      />

      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Card className="relative overflow-hidden p-3">
          <div className="absolute right-4 top-3 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><Handshake size={18} /></div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor ativo</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950">{formatCurrency(valorAtivo)}</p>
        </Card>
        {[
          ['Ativos', ativos, 'andamento', 'bg-emerald-50 text-emerald-700'],
          ['Em atraso', atraso, 'atenção', 'bg-amber-50 text-amber-700'],
          ['Rompidos', rompidos, 'risco', 'bg-red-50 text-red-700'],
        ].map(([title, value, tag, tagClass]) => (
          <Card key={title} className="p-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{title}</p>
            <div className="mt-1.5 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tagClass}`}>{tag}</span>
            </div>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 bg-white/80 px-4 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <h2 className="text-base font-medium text-slate-950">Fila de acordos</h2>
          </div>

          <form className="mt-3 grid gap-3 xl:grid-cols-[minmax(220px,1.2fr)_150px_150px_155px_155px_210px_auto_auto] xl:items-end">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Busca</span>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input name="q" className="pl-9" defaultValue={clean(params.q)} placeholder="Condomínio, unidade, responsável..." />
              </div>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Status</span>
              <Select name="status" defaultValue={clean(params.status)}>
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="em atraso">Em atraso</option>
                <option value="quebrado">Quebrado</option>
                <option value="rompido">Rompido</option>
                <option value="quitado">Quitado</option>
                <option value="cancelado">Cancelado</option>
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Tipo</span>
              <Select name="tipo" defaultValue={clean(params.tipo)}>
                <option value="">Todos</option>
                <option value="extrajudicial">Extrajudicial</option>
                <option value="judicial">Judicial</option>
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Data início</span>
              <Input name="data_de" type="date" defaultValue={dateFilter(params.data_de)} />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Data fim</span>
              <Input name="data_ate" type="date" defaultValue={dateFilter(params.data_ate)} />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Ordenar por</span>
              <Select name="ordenar" defaultValue={clean(params.ordenar) || 'condominio'}>
                <option value="condominio">Condomínio</option>
                <option value="unidade">Unidade</option>
                <option value="responsavel">Responsável</option>
                <option value="status">Status</option>
                <option value="data_desc">Data mais recente</option>
                <option value="data_asc">Data mais antiga</option>
                <option value="valor_desc">Maior valor</option>
                <option value="valor_asc">Menor valor</option>
              </Select>
            </label>

            <Button type="submit">Filtrar</Button>
            {hasFilters ? <ButtonLink href="/app/acordos" variant="secondary">Limpar</ButtonLink> : null}
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="p-3"><EmptyState title="Nenhum acordo encontrado" description="Crie acordos a partir das cobranças negociadas." /></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {groups.map((group) => (
              <section key={group.condominioId} className="bg-white">
                <div className="flex items-center justify-between gap-3 bg-slate-50/70 px-4 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{group.condominio}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{group.acordos.length} acordo(s)</p>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {group.acordos.map((row: any) => (
                    <Link key={row.id} href={`/app/acordos/${row.id}`} className="group grid gap-3 px-4 py-3 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1.4fr)_120px_140px_150px_90px] xl:items-center">
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
