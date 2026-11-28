import { ParcelaPagamentoForm } from "./parcela-pagamento-form";
import type { AgreementKind } from '@/features/acordos/agreement-kind'
import { criadoNoIntervalo } from '@/lib/core/filtros-criacao'
import { operadorResponsavelId } from '@/lib/core/operador-responsavel'
import { listOperadoresCadastro } from '@/features/condominios/organizacao-queries'
import Link from 'next/link'
import { CalendarClock, ChevronDown, RotateCcw } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import {
  ClearFiltersLink,
  ListFilterField,
  ListFiltersForm,
  ListKpiGrid,
  ListPagination,
  ListPanel,
  ListPanelHeader,
  ListSearchField,
  ListTitle,
  ListTitleBar,
} from '@/components/layout/list-page'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CondominioSearchSelect } from '@/components/gestao/condominio-search-select'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { EmptyState } from '@/components/data/empty-state'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listParcelasAcordosOperacionais } from '@/features/acordos/queries'
import { solicitarReemissaoParcelaAcordo } from '@/features/acordos/actions'

type SearchParams = Promise<{
  condominio_id?: string
  carteira_id?: string
  vencimento_de?: string
  vencimento_ate?: string
  criacao_de?: string
  criacao_ate?: string
  operador_id?: string
  status?: string
  repasse?: string
  tipo?: string
  ordenar?: string
  q?: string
  page?: string
}>

const PAGE_SIZE = 30

function getPageParam(value: unknown) {
  const page = Number(value ?? 1)
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

function pageHref(params: Record<string, string | undefined>, page: number, basePath: string) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'page' && value) query.set(key, value)
  }
  query.set('page', String(page))
  return `${basePath}?${query.toString()}`
}

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
  const groups = new Map<string, { id: string; nome: string; carteiraId: string; carteiraNome: string; parcelas: any[] }>()
  for (const row of rows) {
    const condominio = row.acordo?.condominios
    const carteiraId = row.acordo?.carteiras?.id ?? row.acordo?.carteira_id ?? 'sem-carteira'
    const carteiraNome = row.acordo?.carteiras?.nome ?? 'Carteira não informada'
    const id = `${carteiraId}:${condominio?.id ?? 'sem-condominio'}`
    if (!groups.has(id)) groups.set(id, { id, nome: condominio?.nome ?? 'Condomínio não informado', carteiraId, carteiraNome, parcelas: [] })
    groups.get(id)!.parcelas.push(row)
  }
  return Array.from(groups.values()).sort((a, b) => a.carteiraNome.localeCompare(b.carteiraNome, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'))
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
    if (!criadoNoIntervalo(row.created_at, filters.criacao_de, filters.criacao_ate)) return false
    if (filters.operador_id && operadorResponsavelId(acordo) !== filters.operador_id.trim()) return false
    const condominio = acordo.condominios ?? {}
    const unidade = acordo.unidades ?? {}
    const vencimento = String(row.vencimento ?? '')

    if (condominioId && condominio.id !== condominioId) return false
    if (carteiraId && acordo.carteira_id !== carteiraId) return false
    if (vencimentoDe && vencimento < vencimentoDe) return false
    if (vencimentoAte && vencimento > vencimentoAte) return false
    if (status && row.status !== status) return false
    if (filters.repasse === 'sem_ou_zero' && row.valor_repasse_informado != null && Number(row.valor_repasse_informado) !== 0) return false
    if (tipo && (row.tipo_parcela ?? 'parcela') !== tipo) return false

    if (termo) {
      const haystack = normalizeText([
        condominio.nome,
        unidade.identificacao,
        unidade.bloco,
        unidade.responsavel_nome,
        acordo.numero_processo,
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

function sumPaidRows(rows: any[]) {
  return rows.reduce((sum, row) => sum + Number(row.valor_pago ?? row.valor ?? 0), 0)
}

function agruparPorAcordo(parcelas: any[]) {
  const grupos = new Map<string, any[]>()
  for (const parcela of parcelas) {
    const grupo = grupos.get(parcela.acordo_id)
    if (grupo) grupo.push(parcela)
    else grupos.set(parcela.acordo_id, [parcela])
  }
  return grupos
}

function ParcelasDoAcordo({ acordoId, parcelas }: { acordoId: string; parcelas: any[] }) {
  const acordo = parcelas[0].acordo
  const unidade = acordo?.unidades ?? {}
  const resumo = acordo?.resumoPagamentos
  return (
    <section className="rounded-lg border border-slate-300 bg-white">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-t-lg bg-cyan-900 px-4 py-2 text-sm text-white">
        <Link href={`/app/acordos/${acordoId}`} title="Abrir acordo" className="font-semibold text-white underline decoration-cyan-200 underline-offset-4 focus-visible:outline-2 focus-visible:outline-white">
          {unidade.identificacao ?? '—'}{unidade.bloco != null && unidade.bloco !== '' ? `/${unidade.bloco}` : ''}
        </Link>
        <span>{unidade.responsavel_nome || 'Responsável não informado'}</span>
        {resumo && <span className="flex flex-wrap gap-x-4 text-xs text-cyan-50 tabular-nums sm:ml-auto">
          <span>Total do acordo: <strong>{acordo.valor_acordado == null ? 'Não informado' : formatCurrency(Number(acordo.valor_acordado))}</strong></span>
          <span>Total pago: <strong>{resumo.totalPago == null ? 'Não informado' : formatCurrency(resumo.totalPago)}</strong></span>
          <span>Parcelas pagas: <strong>{resumo.pagas} de {resumo.quantidade}</strong></span>
        </span>}
        {acordo?.numero_processo && <span className="text-xs text-cyan-50">Processo {acordo.numero_processo}</span>}
      </div>
      <div className="divide-y divide-slate-100">
        {parcelas.map(row => <ParcelaLinha key={row.id} row={row} />)}
      </div>
    </section>
  )
}

function ParcelaLinha({ row }: { row: any }) {
  const paga = isParcelaPaga(row)
  const cancelada = ["cancelada", "cancelado"].includes(String(row.status).toLowerCase())
  const reemissaoPermitida = !paga && podeReemitir(row)
  const diasPermitidos = Number(row.acordo?.condominios?.dias_reemissao_parcela_acordo_atrasada ?? 0)

  return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm tabular-nums hover:bg-slate-50">
        <span className="whitespace-nowrap"><abbr title="Parcela" className="text-slate-600 no-underline">Parc:</abbr> {row.numero ?? '—'}</span>
        <span className="whitespace-nowrap"><abbr title="Vencimento" className="text-slate-600 no-underline">Venc:</abbr> {formatDateBR(row.vencimento)}</span>
        {paga && <span className="whitespace-nowrap"><span className="text-slate-600">{cancelada || row.valor_pago == null ? 'Valor:' : 'Valor pago:'}</span> {formatCurrency(Number(row.valor_pago ?? row.valor))}</span>}
        {cancelada ? <>
          <span className="whitespace-nowrap"><span className="text-slate-600">Despesa:</span> {row.valor_repasse_informado == null ? 'Automático' : formatCurrency(Number(row.valor_repasse_informado))}</span>
          <span>Cancelada</span>
        </> : <ParcelaPagamentoForm parcela={row} acordoId={row.acordo_id} paga={paga} compacta />}

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

export default async function InstallmentsListPage({ searchParams, agreementKind }: { searchParams: SearchParams; agreementKind: AgreementKind }) {
  const judicial = agreementKind === 'judicial'
  const agreementPath = judicial ? '/app/acordos/judiciais' : '/app/acordos'
  const basePath = `${agreementPath}/fila`
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const [allRows, operadores] = await Promise.all([listParcelasAcordosOperacionais(scope, agreementKind), listOperadoresCadastro()])
  const filteredRows = sortRows(filterRows(allRows, params), String(params.ordenar ?? 'vencimento_asc'))
  const allGroups = groupRows(filteredRows)
  const totalPages = Math.max(1, Math.ceil(allGroups.length / PAGE_SIZE))
  const page = Math.min(getPageParam(params.page), totalPages)
  const groups = allGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const rows = groups.flatMap((group) => group.parcelas)
  const carteiraGroups = Array.from(groups.reduce((map, group) => {
    const carteira = map.get(group.carteiraId) ?? { id: group.carteiraId, nome: group.carteiraNome, condominios: [] as typeof groups }
    carteira.condominios.push(group)
    map.set(group.carteiraId, carteira)
    return map
  }, new Map<string, { id: string; nome: string; condominios: typeof groups }>()).values())
  const condominios = getCondominios(allRows)
  const carteiras = getCarteiras(allRows)

  const pagas = filteredRows.filter(isParcelaPaga)
  const abertas = filteredRows.filter((row) => !isParcelaPaga(row))
  const atrasadas = filteredRows.filter((row) => {
    const dias = getDiasAtraso(row.vencimento)
    return !isParcelaPaga(row) && dias !== null && dias > 0
  })
  const hasFilters = Boolean(params.criacao_de || params.criacao_ate || params.operador_id || params.condominio_id || params.carteira_id || params.vencimento_de || params.vencimento_ate || params.status || params.repasse || params.tipo || params.ordenar || params.q)

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Base Operacional"
        title={judicial ? "Parcelas e pagamentos judiciais" : "Parcelas de acordos extrajudiciais"}
        description="Acompanhe vencimentos, confirme pagamentos e solicite reemissões sem sair da tela."
        actions={
          <>
            <ButtonLink href={agreementPath} variant="secondary">Voltar</ButtonLink>
          </>
        }
      />

      <ListKpiGrid>
        {[
          ['Parcelas', filteredRows.length, sumRows(filteredRows)],
          ['Abertas', abertas.length, sumRows(abertas)],
          ['Atrasadas', atrasadas.length, sumRows(atrasadas)],
          ['Pagas', pagas.length, sumPaidRows(pagas)],
        ].map(([title, quantity, total]) => (
          <Card key={String(title)} className="p-3">
            <p className="text-xs font-medium uppercase text-slate-400">{title}</p>
            <div className="mt-1.5 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold text-slate-950">{quantity}</p>
              <p className="text-sm font-semibold text-slate-700">{formatCurrency(Number(total))}</p>
            </div>
          </Card>
        ))}
      </ListKpiGrid>

      <ListPanel>
        <ListPanelHeader className="bg-white/80">
          <ListTitleBar className="xl:items-center">
            <ListTitle title="Filtros das parcelas" />
            <ClearFiltersLink href={basePath} show={hasFilters} />
          </ListTitleBar>
          <ListFiltersForm className="grid-cols-1 md:grid-cols-2 xl:grid-cols-12">
          <ListSearchField defaultValue={params.q ?? ''} placeholder="Unidade, responsável, parcela..." className="xl:col-span-3" />
          <ListFilterField label="Condomínio" className="xl:col-span-5">
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
          </ListFilterField>
          <ListFilterField label="Carteira" className="xl:col-span-4">
            <Select name="carteira_id" defaultValue={params.carteira_id ?? ''}>
              <option value="">Todas</option>
              {carteiras.map((carteira) => <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>)}
            </Select>
          </ListFilterField>
          <ListFilterField label="Status" className="xl:col-span-2">
            <Select name="status" defaultValue={params.status ?? ''}>
              <option value="">Todos</option>
              <option value="aberta">Aberta</option>
              <option value="vencida">Vencida</option>
              <option value="paga">Paga</option>
              <option value="cancelada">Cancelada</option>
            </Select>
          </ListFilterField>
          <ListFilterField label="Tipo" className="xl:col-span-2">
            <Select name="tipo" defaultValue={params.tipo ?? ''}>
              <option value="">Todos</option>
              <option value="entrada">Entrada</option>
              <option value="parcela">Parcela</option>
            </Select>
          </ListFilterField>
          <ListFilterField label="Repasse da parcela" className="xl:col-span-3">
            <Select name="repasse" defaultValue={params.repasse ?? ''}>
              <option value="">Todos</option>
              <option value="sem_ou_zero">Em branco ou R$ 0,00</option>
            </Select>
          </ListFilterField>
          <ListFilterField label="Vencimento de" className="xl:col-span-2">
            <Input name="vencimento_de" type="date" defaultValue={dateValue(params.vencimento_de)} />
          </ListFilterField>
          <ListFilterField label="Vencimento até" className="xl:col-span-2">
            <Input name="vencimento_ate" type="date" defaultValue={dateValue(params.vencimento_ate)} />
          </ListFilterField>
          <ListFilterField label="Operador responsável" className="xl:col-span-3">
            <Select name="operador_id" defaultValue={params.operador_id ?? ''}>
              <option value="">Todos</option>
              {operadores.map(operador => <option key={operador.id} value={operador.id}>{operador.nome}</option>)}
            </Select>
          </ListFilterField>
          <ListFilterField label="Criação da parcela de" className="xl:col-span-2">
            <Input name="criacao_de" type="date" defaultValue={dateValue(params.criacao_de)} />
          </ListFilterField>
          <ListFilterField label="Criação da parcela até" className="xl:col-span-2">
            <Input name="criacao_ate" type="date" defaultValue={dateValue(params.criacao_ate)} />
          </ListFilterField>
          <ListFilterField label="Ordenar por" className="xl:col-span-3">
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
          </ListFilterField>
          <Button type="submit" className="w-full xl:col-span-1">Filtrar</Button>
          </ListFiltersForm>
        </ListPanelHeader>
      </ListPanel>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 bg-white/80 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><CalendarClock size={18} /></div>
            <div>
              <h2 className="text-base font-medium text-slate-950">Parcelas por carteira e condomínio</h2>
              <p className="text-xs text-slate-500">{groups.length} de {allGroups.length} condomínio(s) nesta página</p>
              <p className="text-xs text-slate-500">Deixe a despesa em branco para usar o rateio do acordo ou informe 0,00 para isenção.</p>
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-3"><EmptyState title="Nenhuma parcela encontrada" description="Ajuste os filtros para ampliar a consulta." /></div>
        ) : (
          <div className="divide-y divide-slate-200">
            {carteiraGroups.map((carteira) => (
              <details key={carteira.id} className="group/carteira bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-y border-slate-200 bg-slate-100/80 px-4 py-3 transition hover:bg-slate-200/70 [&::-webkit-details-marker]:hidden">
                  <div className="flex min-w-0 items-center gap-3">
                    <ChevronDown size={17} className="shrink-0 text-slate-500 transition-transform group-open/carteira:rotate-180" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">{carteira.nome}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{carteira.condominios.length} condomínio(s) nesta página</p>
                    </div>
                  </div>
                </summary>
                <div className="divide-y divide-slate-200 pl-3">
            {carteira.condominios.map((group) => (
              <details key={group.id} className="group/condominio bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-slate-50/80 px-4 py-3 transition hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
                  <div className="flex min-w-0 items-center gap-3">
                    <ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open/condominio:rotate-180" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{group.nome}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{group.parcelas.length} parcela(s) · {formatCurrency(sumRows(group.parcelas))}</p>
                    </div>
                  </div>
                </summary>
                <div className="space-y-3 border-t border-slate-200 bg-slate-100 p-2 sm:p-3">
                  {Array.from(agruparPorAcordo(group.parcelas), ([acordoId, parcelas]) => (
                    <ParcelasDoAcordo key={acordoId} acordoId={acordoId} parcelas={parcelas} />
                  ))}
                </div>
              </details>
            ))}
                </div>
              </details>
            ))}
          </div>
        )}
        <ListPagination
          page={page}
          pageSize={PAGE_SIZE}
          total={allGroups.length}
          previousHref={page > 1 ? pageHref(params, page - 1, basePath) : undefined}
          nextHref={page * PAGE_SIZE < allGroups.length ? pageHref(params, page + 1, basePath) : undefined}
        />
        </Card>
    </div>
  )
}
