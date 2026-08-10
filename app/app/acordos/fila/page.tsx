import Link from 'next/link'
import { ArrowUpRight, BriefcaseBusiness, CalendarClock, CheckCircle2, ChevronDown, Filter, RotateCcw, Search, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CondominioSearchSelect } from '@/components/gestao/condominio-search-select'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { StatusBadge } from '@/components/data/status-badge'
import { AgreementHealthBadge } from '@/features/acordos/components/agreement-health-badge'
import { EmptyState } from '@/components/data/empty-state'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listParcelasAcordosOperacionais } from '@/features/acordos/queries'
import { marcarParcelaComoPaga, solicitarReemissaoParcelaAcordo } from '@/features/acordos/actions'

type SearchParams = Promise<{
  condominio_id?: string
  carteira_id?: string
  vencimento_de?: string
  vencimento_ate?: string
  status?: string
  tipo?: string
  ordenar?: string
  q?: string
}>

function normalizeText(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function dateValue(value: unknown) {
  const text = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function isParcelaPaga(row: any) {
  return ['paga', 'pago', 'quitada', 'quitado', 'cancelada', 'cancelado'].includes(String(row.status ?? '').toLowerCase()) || Boolean(row.data_pagamento)
}

function getDiasAtraso(vencimento: string | null | undefined) {
  if (!vencimento) return null
  const data = new Date(`${vencimento}T00:00:00`)
  if (Number.isNaN(data.getTime())) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.floor((hoje.getTime() - data.getTime()) / 86400000)
}

function podeReemitir(row: any) {
  const status = String(row.status ?? '').toLowerCase()
  const diasPermitidos = Number(row.acordo?.condominios?.dias_reemissao_parcela_acordo_atrasada ?? 0)
  const diasAtraso = getDiasAtraso(row.vencimento)
  return status === 'vencida' && diasPermitidos > 0 && diasAtraso !== null && diasAtraso >= 0 && diasAtraso <= diasPermitidos
}

function getCondominios(rows: any[]) {
  const map = new Map<string, string>()
  for (const row of rows) {
    const condominio = row.acordo?.condominios
    if (condominio?.id && condominio?.nome) map.set(condominio.id, condominio.nome)
  }
  return Array.from(map.entries())
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function getCarteiras(rows: any[]) {
  const map = new Map<string, string>()
  for (const row of rows) {
    const carteira = row.acordo?.carteiras
    if (carteira?.id && carteira?.nome) map.set(carteira.id, carteira.nome)
  }
  return Array.from(map.entries())
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function groupRows(rows: any[]) {
  const groups = new Map<string, { id: string; nome: string; parcelas: any[] }>()
  for (const row of rows) {
    const condominio = row.acordo?.condominios
    const id = condominio?.id ?? 'sem-condominio'
    if (!groups.has(id)) groups.set(id, { id, nome: condominio?.nome ?? 'Condomínio não informado', parcelas: [] })
    groups.get(id)!.parcelas.push(row)
  }
  return Array.from(groups.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function filterRows(rows: any[], filters: Awaited<SearchParams>) {
  const condominioId = String(filters.condominio_id ?? '').trim()
  const carteiraId = String(filters.carteira_id ?? '').trim()
  const vencimentoDe = dateValue(filters.vencimento_de)
  const vencimentoAte = dateValue(filters.vencimento_ate)
  const status = String(filters.status ?? '').trim()
  const tipo = String(filters.tipo ?? '').trim()
  const termo = normalizeText(filters.q)

  return rows.filter((row) => {
    const acordo = row.acordo ?? {}
    const condominio = acordo.condominios ?? {}
    const unidade = acordo.unidades ?? {}
    const vencimento = String(row.vencimento ?? '')

    if (condominioId && condominio.id !== condominioId) return false
    if (carteiraId && acordo.carteira_id !== carteiraId) return false
    if (vencimentoDe && vencimento < vencimentoDe) return false
    if (vencimentoAte && vencimento > vencimentoAte) return false
    if (status && row.status !== status) return false
    if (tipo && (row.tipo_parcela ?? 'parcela') !== tipo) return false

    if (termo) {
      const haystack = normalizeText([
        condominio.nome,
        unidade.identificacao,
        unidade.bloco,
        unidade.responsavel_nome,
        row.numero,
        row.status,
        acordo.carteiras?.nome,
      ].filter(Boolean).join(' '))
      if (!haystack.includes(termo)) return false
    }

    return true
  })
}

function getComparable(row: any, field: string) {
  if (field === 'vencimento_desc' || field === 'vencimento_asc') return new Date(`${row.vencimento ?? '1900-01-01'}T00:00:00`).getTime()
  if (field === 'valor_desc' || field === 'valor_asc') return Number(row.valor ?? 0)
  if (field === 'condominio') return normalizeText(row.acordo?.condominios?.nome)
  if (field === 'unidade') return normalizeText(row.acordo?.unidades?.identificacao)
  if (field === 'responsavel') return normalizeText(row.acordo?.unidades?.responsavel_nome)
  if (field === 'status') return normalizeText(row.status)
  return new Date(`${row.vencimento ?? '1900-01-01'}T00:00:00`).getTime()
}

function sortRows(rows: any[], ordenar: string) {
  const field = ordenar || 'vencimento_asc'
  return [...rows].sort((a, b) => {
    const av = getComparable(a, field)
    const bv = getComparable(b, field)
    if (typeof av === 'number' && typeof bv === 'number') return field.endsWith('_desc') ? bv - av : av - bv
    return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true })
  })
}

function sumRows(rows: any[]) {
  return rows.reduce((sum, row) => sum + Number(row.valor ?? 0), 0)
}

function ParcelaActions({ row }: { row: any }) {
  const paga = isParcelaPaga(row)
  const reemissaoPermitida = podeReemitir(row)
  const diasPermitidos = Number(row.acordo?.condominios?.dias_reemissao_parcela_acordo_atrasada ?? 0)

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <form action={marcarParcelaComoPaga}>
        <input type="hidden" name="parcela_id" value={row.id} />
        <input type="hidden" name="acordo_id" value={row.acordo_id} />
        <PendingSubmitButton
          size="sm"
          disabled={paga}
          className="bg-emerald-600 hover:bg-emerald-700"
          icon={<CheckCircle2 size={14} />}
          pendingLabel="Confirmando..."
        >
          Pago
        </PendingSubmitButton>
      </form>

      <form action={solicitarReemissaoParcelaAcordo}>
        <input type="hidden" name="parcela_id" value={row.id} />
        <input type="hidden" name="acordo_id" value={row.acordo_id} />
        <PendingSubmitButton
          variant="secondary"
          size="sm"
          disabled={!reemissaoPermitida}
          icon={<RotateCcw size={14} />}
          pendingLabel="Solicitando..."
          title={
            diasPermitidos <= 0
              ? 'Este condomínio não permite reemissão de parcela em atraso.'
              : 'A reemissão só fica disponível para parcela vencida dentro da janela do condomínio.'
          }
        >
          Reemitir
        </PendingSubmitButton>
      </form>
    </div>
  )
}

export default async function FilaOperacionalAcordosPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const allRows = await listParcelasAcordosOperacionais(scope)
  const rows = sortRows(filterRows(allRows, params), String(params.ordenar ?? 'vencimento_asc'))
  const condominios = getCondominios(allRows)
  const carteiras = getCarteiras(allRows)
  const groups = groupRows(rows)

  const pagas = rows.filter(isParcelaPaga)
  const abertas = rows.filter((row) => !isParcelaPaga(row))
  const atrasadas = rows.filter((row) => {
    const dias = getDiasAtraso(row.vencimento)
    return !isParcelaPaga(row) && dias !== null && dias > 0
  })
  const hasFilters = Boolean(params.condominio_id || params.carteira_id || params.vencimento_de || params.vencimento_ate || params.status || params.tipo || params.ordenar || params.q)

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Acordos"
        title="Parcelas de acordos"
        description="Acompanhe vencimentos, confirme pagamentos e solicite reemissões sem sair da tela."
        actions={
          <>
            <ButtonLink href="/app/acordos" variant="secondary">Voltar</ButtonLink>
          </>
        }
      />

      <section className="grid gap-2 md:grid-cols-4">
        <Card className="p-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Parcelas</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{rows.length}</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{formatCurrency(sumRows(rows))}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Abertas</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{abertas.length}</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{formatCurrency(sumRows(abertas))}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Atrasadas</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{atrasadas.length}</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{formatCurrency(sumRows(atrasadas))}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Pagas</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{pagas.length}</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{formatCurrency(sumRows(pagas))}</p>
        </Card>
      </section>

      <Card className="p-3">
        <form className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7 2xl:items-end [&>label]:min-w-0 [&_button]:whitespace-nowrap [&_input]:min-w-0 [&_input]:text-[13px] [&_select]:min-w-0 [&_select]:text-[13px]">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Busca</span>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input name="q" defaultValue={params.q ?? ''} className="pl-9" placeholder="Unidade, responsável, parcela..." />
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Carteira</span>
            <Select name="carteira_id" defaultValue={params.carteira_id ?? ''}>
              <option value="">Todas</option>
              {carteiras.map((carteira) => <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>)}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Condomínio</span>
            <CondominioSearchSelect
              name="condominio_id"
              options={condominios.map((condominio) => ({
                id: condominio.id,
                nome: condominio.nome,
                administradora: null,
              }))}
              selectedId={params.condominio_id ?? ''}
              defaultToFirst={false}
              inputClassName=""
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Status</span>
            <Select name="status" defaultValue={params.status ?? ''}>
              <option value="">Todos</option>
              <option value="aberta">Aberta</option>
              <option value="vencida">Vencida</option>
              <option value="paga">Paga</option>
              <option value="cancelada">Cancelada</option>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Tipo</span>
            <Select name="tipo" defaultValue={params.tipo ?? ''}>
              <option value="">Todos</option>
              <option value="entrada">Entrada</option>
              <option value="parcela">Parcela</option>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Vencimento de</span>
            <Input name="vencimento_de" type="date" defaultValue={dateValue(params.vencimento_de)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Vencimento até</span>
            <Input name="vencimento_ate" type="date" defaultValue={dateValue(params.vencimento_ate)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Ordenar por</span>
            <Select name="ordenar" defaultValue={params.ordenar ?? 'vencimento_asc'}>
              <option value="vencimento_asc">Vencimento antigo</option>
              <option value="vencimento_desc">Vencimento recente</option>
              <option value="condominio">Condomínio</option>
              <option value="unidade">Unidade</option>
              <option value="responsavel">Responsável</option>
              <option value="status">Status</option>
              <option value="valor_desc">Maior valor</option>
              <option value="valor_asc">Menor valor</option>
            </Select>
          </label>
          <Button type="submit" className="w-full xl:w-auto">
            <Filter size={16} />
            Filtrar
          </Button>
          {hasFilters ? (
            <ButtonLink href="/app/acordos/fila" variant="secondary" className="w-full xl:w-auto">
              <X size={16} />
              Limpar
            </ButtonLink>
          ) : null}
        </form>
        </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 bg-white/80 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><CalendarClock size={18} /></div>
            <div>
              <h2 className="text-base font-medium text-slate-950">Parcelas por condomínio</h2>
              <p className="text-xs text-slate-500">{groups.length} condomínio(s) na seleção</p>
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-3"><EmptyState title="Nenhuma parcela encontrada" description="Ajuste os filtros para ampliar a consulta." /></div>
        ) : (
          <div className="divide-y divide-slate-200">
            {groups.map((group) => (
              <details key={group.id} open className="group/condominio bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-slate-50/80 px-4 py-3 transition hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
                  <div className="flex min-w-0 items-center gap-3">
                    <ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open/condominio:rotate-180" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{group.nome}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{group.parcelas.length} parcela(s) · {formatCurrency(sumRows(group.parcelas))}</p>
                    </div>
                  </div>
                </summary>
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {group.parcelas.map((row: any) => {
                    const acordo = row.acordo ?? {}
                    const unidade = acordo.unidades ?? {}
                    return (
                <div key={row.id} className="grid gap-3 px-4 py-3 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1.4fr)_120px_150px_120px_190px_90px] xl:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{row.janela_operacional}</span>
                      <StatusBadge status={row.status} />
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-slate-950">Unidade {unidade.identificacao ?? '-'}{unidade.bloco ? ` · Bloco ${unidade.bloco}` : ''}</p>
                    <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500">
                      <BriefcaseBusiness size={12} className="shrink-0" />
                      {acordo.carteiras?.nome ?? 'Carteira não informada'} · {unidade.responsavel_nome ?? 'Responsável não informado'} · Parcela #{row.numero ?? '-'}
                    </p>
                  </div>
                  <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor</p><p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor ?? 0))}</p></div>
                  <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Vencimento</p><p className="mt-1 text-sm text-slate-700">{formatDateBR(row.vencimento)}</p></div>
                  <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Saúde</p><div className="mt-1"><AgreementHealthBadge health={row.saude_acordo} /></div></div>
                  <ParcelaActions row={row} />
                  <div className="flex justify-end">
                    <Link href={`/app/acordos/${row.acordo_id}`} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-[var(--gkli-primary)]" title="Abrir acordo">
                      <ArrowUpRight size={16} />
                    </Link>
                  </div>
                </div>
                    )
                  })}
                </div>
              </details>
            ))}
          </div>
        )}
        </Card>
    </div>
  )
}
