import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileText } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ButtonLink } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { PrintButton } from '@/components/ui/print-button'
import { StatusBadge } from '@/components/data/status-badge'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getLaudoPreJuridicoDaUnidade } from '@/features/unidades/queries'
import { getCobrancaStatusOperacional } from '@/lib/core/cobranca-status'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ cobrancaIds?: string | string[] }>
}

function n(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function valorAtualizado(cobranca: any) {
  const calculado = Math.max(
    0,
    n(cobranca.valor_original) +
      n(cobranca.juros) +
      n(cobranca.multa) +
      n(cobranca.correcao) -
      n(cobranca.desconto),
  )
  return n(cobranca.valor_atualizado) || calculado
}

function statusLabel(status?: string | null) {
  return String(status ?? '').replace(/_/g, ' ') || '-'
}

export default async function LaudoPreJuridicoUnidadePage({ params, searchParams }: PageProps) {
  const { id } = await params
  const query = searchParams ? await searchParams : {}
  const scope = await getPermittedCarteiras()
  const data = await getLaudoPreJuridicoDaUnidade(id, scope, query.cobrancaIds)

  if (!data) notFound()

  const { unidade, cobrancas, selecionaveis, selecionadas, timeline } = data
  const hasSelection = selecionadas.length > 0
  const totalSelecionado = selecionadas.reduce((sum, cobranca) => sum + valorAtualizado(cobranca), 0)
  const primeiraVencida = selecionadas[0]?.vencimento ?? null
  const ultimaVencida = selecionadas[selecionadas.length - 1]?.vencimento ?? null
  const condominio = unidade.condominios
  const carteira = unidade.carteiras

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Unidade"
        title="Laudo pré-jurídico"
        description="Selecione as cotas e gere o relatório de encaminhamento com histórico de cobrança extrajudicial."
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/app/unidades/${id}`} variant="secondary">
              <ArrowLeft size={16} />
              Voltar à unidade
            </ButtonLink>
            {hasSelection ? <PrintButton label="Imprimir laudo" /> : null}
          </div>
        }
      />

      {!hasSelection ? (
        <form method="get" className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-950">Cotas da unidade</h2>
              <p className="mt-1 text-sm text-slate-500">
                Marque as cobranças que farão parte do laudo de encaminhamento.
              </p>
            </div>

            {cobrancas.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Nenhuma cobrança encontrada para esta unidade.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="w-12 px-4 py-3">Sel.</th>
                      <th className="px-4 py-3">Vencimento</th>
                      <th className="px-4 py-3">Competência</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Valor atualizado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {cobrancas.map((cobranca: any) => {
                      const status = getCobrancaStatusOperacional(cobranca)
                      const bloqueada = !selecionaveis.some((item: any) => item.id === cobranca.id)
                      return (
                        <tr key={cobranca.id} className={bloqueada ? 'bg-slate-50 opacity-70' : ''}>
                          <td className="px-4 py-3 align-top">
                            <input
                              type="checkbox"
                              name="cobrancaIds"
                              value={cobranca.id}
                              defaultChecked={!bloqueada}
                              disabled={bloqueada}
                              className="h-4 w-4 rounded border-slate-300 accent-[var(--gkli-primary)]"
                            />
                          </td>
                          <td className="px-4 py-3 align-top font-medium text-slate-950">
                            {formatDateBR(cobranca.vencimento)}
                          </td>
                          <td className="px-4 py-3 align-top text-slate-600">{cobranca.competencia ?? '-'}</td>
                          <td className="px-4 py-3 align-top"><StatusBadge status={status} /></td>
                          <td className="px-4 py-3 align-top text-right font-semibold text-slate-950">
                            {formatCurrency(valorAtualizado(cobranca))}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="space-y-4">
            <Card>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-950">{condominio?.nome ?? 'Condomínio não informado'}</p>
                <p className="mt-1 text-sm text-slate-600">
                  Unidade {unidade.identificacao ?? '-'}
                  {unidade.bloco ? ` · Bloco ${unidade.bloco}` : ''} · {unidade.responsavel_nome ?? 'Responsável não informado'}
                </p>
              </div>

              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Selecionáveis</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-950">{selecionaveis.length}</p>
                </div>
                <Button type="submit" disabled={selecionaveis.length === 0} className="w-full">
                  <FileText size={16} />
                  Gerar laudo
                </Button>
              </div>
            </Card>
          </div>
        </form>
      ) : (
        <div className="space-y-6 print:space-y-4">
          <Card className="p-6 print:border-0 print:shadow-none">
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Relatório operacional</p>
                <h1 className="mt-2 text-2xl font-semibold text-slate-950">Laudo para encaminhamento pré-jurídico</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Relatório de cotas selecionadas e histórico de tentativas de cobrança extrajudicial para análise e preparação documental.
                </p>
              </div>
              <div className="text-sm text-slate-500 print:text-right">
                <p>Emitido em {formatDateBR(new Date().toISOString())}</p>
                <p>{carteira?.nome ?? 'Carteira não informada'}</p>
              </div>
            </div>

            <section className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Condomínio</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{condominio?.nome ?? '-'}</p>
                <p className="mt-1 text-sm text-slate-600">CNPJ {condominio?.cnpj ?? '-'}</p>
                <p className="mt-1 text-sm text-slate-600">Administradora {condominio?.administradora ?? '-'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Unidade / responsável</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">
                  Unidade {unidade.identificacao ?? '-'}{unidade.bloco ? ` · Bloco ${unidade.bloco}` : ''}
                </p>
                <p className="mt-1 text-sm text-slate-600">{unidade.responsavel_nome ?? 'Responsável não informado'}</p>
                <p className="mt-1 text-sm text-slate-600">Documento {unidade.responsavel_documento ?? '-'}</p>
                <p className="mt-1 text-sm text-slate-600">{unidade.telefone ?? '-'} · {unidade.email ?? '-'}</p>
              </div>
            </section>

            <section className="mt-6 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Cotas</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{selecionadas.length}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Total</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(totalSelecionado)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Primeiro venc.</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{formatDateBR(primeiraVencida)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Último venc.</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{formatDateBR(ultimaVencida)}</p>
              </div>
            </section>
          </Card>

          <Card className="overflow-hidden p-0 print:break-inside-avoid">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-950">Cotas incluídas</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Vencimento</th>
                    <th className="px-4 py-3">Competência</th>
                    <th className="px-4 py-3">Status operacional</th>
                    <th className="px-4 py-3">Status financeiro</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selecionadas.map((cobranca: any) => (
                    <tr key={cobranca.id}>
                      <td className="px-4 py-3 font-medium text-slate-950">{formatDateBR(cobranca.vencimento)}</td>
                      <td className="px-4 py-3 text-slate-600">{cobranca.competencia ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{statusLabel(getCobrancaStatusOperacional(cobranca))}</td>
                      <td className="px-4 py-3 text-slate-600">{statusLabel(cobranca.status_financeiro)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-950">{formatCurrency(valorAtualizado(cobranca))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-950">Timeline de cobrança extrajudicial</h2>
              <p className="mt-1 text-sm text-slate-500">Interações, mensagens, eventos e auditorias vinculados às cotas selecionadas.</p>
            </div>

            {timeline.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Nenhuma tentativa ou evento operacional encontrado para as cotas selecionadas.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {timeline.map((item: any) => (
                  <div key={item.id} className="grid gap-3 px-5 py-4 md:grid-cols-[150px_140px_1fr]">
                    <p className="text-sm font-medium text-slate-950">{formatDateBR(item.data)}</p>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{item.tipo}</p>
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{item.titulo}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{item.descricao ?? '-'}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {item.canal ? `Canal ${item.canal}` : null}
                        {item.destinatario ? ` · ${item.destinatario}` : null}
                        {item.status ? ` · ${statusLabel(item.status)}` : null}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="flex flex-wrap justify-between gap-3 print:hidden">
            <Link href={`/app/unidades/${id}/laudo-pre-juridico`} className="text-sm font-medium text-slate-500 hover:text-slate-950">
              Ajustar seleção
            </Link>
            <PrintButton label="Imprimir laudo" />
          </div>
        </div>
      )}
    </div>
  )
}
