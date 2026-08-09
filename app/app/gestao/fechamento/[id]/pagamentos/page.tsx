import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import {
  ClearFiltersLink,
  ListFilterField,
  ListFiltersForm,
  ListSearchField,
} from '@/components/layout/list-page'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { requireGestor } from '@/utils/auth/require-gestor'
import {
  formatCompetencia,
  getFechamentoPeriodo,
  listFechamentoPagamentos,
} from '@/features/fechamento/queries'

type SearchParams = Record<string, string | string[] | undefined>

function paramValue(params: SearchParams, key: string) {
  const value = params[key]
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim()
}

export default async function FechamentoPagamentosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}) {
  await requireGestor()
  const { id } = await params
  const filtros = await searchParams
  const periodo = await getFechamentoPeriodo(id)
  if (!periodo) notFound()

  const pagamentos = await listFechamentoPagamentos(id, 1000)
  const busca = paramValue(filtros, 'busca').toLocaleLowerCase('pt-BR')
  const carteira = paramValue(filtros, 'carteira')
  const condominio = paramValue(filtros, 'condominio')
  const dataInicial = paramValue(filtros, 'data_inicial')
  const dataFinal = paramValue(filtros, 'data_final')
  const parcela = paramValue(filtros, 'parcela')
  const divergencia = paramValue(filtros, 'divergencia')
  const hasFilters = Boolean(busca || carteira || condominio || dataInicial || dataFinal || parcela || divergencia)

  const carteiras = Array.from(new Set(pagamentos.map((row: any) => row.carteiras?.nome).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'))
  const condominios = Array.from(new Set(pagamentos.map((row: any) => row.condominios?.nome).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'))
  const parcelas = Array.from(new Set(pagamentos.map((row: any) => row.parcelas?.numero).filter((value) => value !== null && value !== undefined))).sort((a, b) => Number(a) - Number(b))

  const pagamentosFiltrados = pagamentos.filter((row: any) => {
    const dataPagamento = String(row.data_pagamento ?? '').slice(0, 10)
    const texto = [
      row.condominios?.nome,
      row.carteiras?.nome,
      row.unidades?.bloco,
      row.unidades?.identificacao,
      row.unidades?.responsavel_nome,
    ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR')

    if (busca && !texto.includes(busca)) return false
    if (carteira && row.carteiras?.nome !== carteira) return false
    if (condominio && row.condominios?.nome !== condominio) return false
    if (dataInicial && dataPagamento < dataInicial) return false
    if (dataFinal && dataPagamento > dataFinal) return false
    if (parcela && String(row.parcelas?.numero ?? '') !== parcela) return false
    if (divergencia === 'sim' && !row.divergencia) return false
    if (divergencia === 'nao' && row.divergencia) return false
    return true
  })

  const acordosFiltrados = new Set(pagamentosFiltrados.map((row: any) => row.acordo_id).filter(Boolean)).size
  const totalFiltrado = pagamentosFiltrados.reduce((sum: number, row: any) => sum + Number(row.valor_pago ?? row.valor_recuperado ?? 0), 0)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Fechamento ${formatCompetencia(periodo.competencia)}`}
        title="Pagamentos recebidos"
        description={`Parcelas confirmadas entre ${formatDateBR(periodo.data_abertura)} e ${formatDateBR(periodo.data_fechamento)}.`}
        actions={<ButtonLink href={`/app/gestao/fechamento/${id}`} variant="secondary">Voltar ao fechamento</ButtonLink>}
      />

      <Card className="p-5">
        <div>
          <h2 className="text-base font-medium text-slate-950">Filtros</h2>
          <p className="mt-1 text-sm text-slate-500">Refine a relação de pagamentos desta competência.</p>
        </div>
        <ListFiltersForm method="get" className="md:grid-cols-2 xl:grid-cols-4">
          <ListSearchField name="busca" label="Unidade ou responsável" defaultValue={paramValue(filtros, 'busca')} placeholder="Digite unidade, bloco ou nome" className="xl:col-span-2" />
          <ListFilterField label="Carteira">
            <select name="carteira" defaultValue={carteira} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800">
              <option value="">Todas</option>
              {carteiras.map((nome) => <option key={String(nome)} value={String(nome)}>{String(nome)}</option>)}
            </select>
          </ListFilterField>
          <ListFilterField label="Condomínio">
            <select name="condominio" defaultValue={condominio} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800">
              <option value="">Todos</option>
              {condominios.map((nome) => <option key={String(nome)} value={String(nome)}>{String(nome)}</option>)}
            </select>
          </ListFilterField>
          <ListFilterField label="Pagamento de">
            <Input name="data_inicial" type="date" defaultValue={dataInicial} className="mt-1" />
          </ListFilterField>
          <ListFilterField label="Pagamento até">
            <Input name="data_final" type="date" defaultValue={dataFinal} className="mt-1" />
          </ListFilterField>
          <ListFilterField label="Parcela">
            <select name="parcela" defaultValue={parcela} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800">
              <option value="">Todas</option>
              {parcelas.map((numero) => <option key={String(numero)} value={String(numero)}>{String(numero)}</option>)}
            </select>
          </ListFilterField>
          <ListFilterField label="Divergência">
            <select name="divergencia" defaultValue={divergencia} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800">
              <option value="">Todas</option>
              <option value="sim">Com divergência</option>
              <option value="nao">Sem divergência</option>
            </select>
          </ListFilterField>
          <div className="flex items-end gap-2 xl:col-span-4">
            <Button type="submit" size="sm">Aplicar filtros</Button>
            <ClearFiltersLink href={`/app/gestao/fechamento/${id}/pagamentos`} show={hasFilters} />
          </div>
        </ListFiltersForm>
      </Card>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Pagamentos</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{pagamentosFiltrados.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Acordos envolvidos</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{acordosFiltrados}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Total recebido</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(totalFiltrado)}</p>
        </Card>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-medium text-slate-950">Relação completa</h2>
          <p className="mt-1 text-sm text-slate-500">{pagamentosFiltrados.length} de {pagamentos.length} pagamento(s).</p>
        </div>

        {pagamentosFiltrados.length === 0 ? (
          <div className="px-5 py-10 text-sm text-slate-500">Nenhum pagamento encontrado com os filtros informados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Carteira / condomínio</th>
                  <th className="px-4 py-3 font-medium">Unidade</th>
                  <th className="px-4 py-3 font-medium">Parcela</th>
                  <th className="px-4 py-3 font-medium">Pagamento</th>
                  <th className="px-4 py-3 text-right font-medium">Recebido</th>
                  <th className="px-5 py-3 text-right font-medium">Repasse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagamentosFiltrados.map((row: any) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{row.condominios?.nome ?? 'Condomínio não informado'}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{row.carteiras?.nome ?? 'Carteira não informada'}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {[row.unidades?.bloco ? `Bloco ${row.unidades.bloco}` : null, row.unidades?.identificacao ? `Unidade ${row.unidades.identificacao}` : null].filter(Boolean).join(' · ') || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.parcelas?.numero ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{formatDateBR(row.data_pagamento)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">{formatCurrency(Number(row.valor_pago ?? row.valor_recuperado ?? 0))}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{formatCurrency(Number(row.valor_despesa_cobranca ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
