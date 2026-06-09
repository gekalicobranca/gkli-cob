import Link from 'next/link'
import { ArrowUpRight, CalendarClock, CheckCircle2, Filter, RotateCcw, Search, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
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
  vencimento_de?: string
  vencimento_ate?: string
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

function filterRows(rows: any[], filters: Awaited<SearchParams>) {
  const condominioId = String(filters.condominio_id ?? '').trim()
  const vencimentoDe = dateValue(filters.vencimento_de)
  const vencimentoAte = dateValue(filters.vencimento_ate)
  const termo = normalizeText(filters.q)

  return rows.filter((row) => {
    const acordo = row.acordo ?? {}
    const condominio = acordo.condominios ?? {}
    const unidade = acordo.unidades ?? {}
    const vencimento = String(row.vencimento ?? '')

    if (condominioId && condominio.id !== condominioId) return false
    if (vencimentoDe && vencimento < vencimentoDe) return false
    if (vencimentoAte && vencimento > vencimentoAte) return false

    if (termo) {
      const haystack = normalizeText([
        condominio.nome,
        unidade.identificacao,
        unidade.bloco,
        unidade.responsavel_nome,
        row.numero,
        row.status,
      ].filter(Boolean).join(' '))
      if (!haystack.includes(termo)) return false
    }

    return true
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
  const rows = filterRows(allRows, params)
  const condominios = getCondominios(allRows)

  const pagas = rows.filter(isParcelaPaga)
  const abertas = rows.filter((row) => !isParcelaPaga(row))
  const atrasadas = rows.filter((row) => {
    const dias = getDiasAtraso(row.vencimento)
    return !isParcelaPaga(row) && dias !== null && dias > 0
  })
  const hasFilters = Boolean(params.condominio_id || params.vencimento_de || params.vencimento_ate || params.q)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Acordos"
        title="Parcelas de acordos"
        description="Acompanhe vencimentos, confirme pagamentos e solicite reemissões sem sair da tela."
        actions={
          <>
            <ButtonLink href="/app/acordos" variant="secondary">Voltar</ButtonLink>
            <ButtonLink href="/app/acordos/novo">Novo acordo</ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Parcelas</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{rows.length}</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{formatCurrency(sumRows(rows))}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Abertas</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{abertas.length}</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{formatCurrency(sumRows(abertas))}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Atrasadas</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{atrasadas.length}</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{formatCurrency(sumRows(atrasadas))}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Pagas</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{pagas.length}</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{formatCurrency(sumRows(pagas))}</p>
        </Card>
      </section>

      <Card className="p-4">
        <form className="grid gap-3 xl:grid-cols-[minmax(220px,1fr)_220px_170px_170px_auto_auto] xl:items-end">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Busca</span>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input name="q" defaultValue={params.q ?? ''} className="pl-9" placeholder="Unidade, responsável, parcela..." />
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Condomínio</span>
            <Select name="condominio_id" defaultValue={params.condominio_id ?? ''}>
              <option value="">Todos</option>
              {condominios.map((condominio) => (
                <option key={condominio.id} value={condominio.id}>{condominio.nome}</option>
              ))}
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
        <div className="border-b border-slate-100 bg-white/80 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><CalendarClock size={18} /></div>
            <div>
              <h2 className="text-base font-medium text-slate-950">Parcelas do acordo</h2>
              <p className="mt-1 text-sm text-slate-500">Ordenadas por vencimento, do mais antigo para o mais recente.</p>
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-5"><EmptyState title="Nenhuma parcela encontrada" description="Ajuste os filtros para ampliar a consulta." /></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => {
              const acordo = row.acordo ?? {}
              const condominio = acordo.condominios ?? {}
              const unidade = acordo.unidades ?? {}
              return (
                <div key={row.id} className="grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1.4fr)_120px_150px_120px_190px_90px] xl:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{row.janela_operacional}</span>
                      <StatusBadge status={row.status} />
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-slate-950">{condominio.nome ?? 'Condomínio não informado'} · Unidade {unidade.identificacao ?? '-'}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{unidade.responsavel_nome ?? 'Responsável não informado'} · Parcela #{row.numero ?? '-'}</p>
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
        )}
      </Card>
    </div>
  )
}
