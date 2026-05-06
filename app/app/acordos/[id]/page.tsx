import { notFound } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { StatusBadge } from '@/components/data/status-badge'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getAcordoDetalhe, listParcelasDoAcordo } from '@/features/acordos/queries'
import { marcarParcelaComoPaga, marcarParcelaComoVencida } from '@/features/acordos/actions'

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function AcordoDetalhePage({ params }: PageProps) {
  const { id } = await params
  const scope = await getPermittedCarteiras()

  const [acordo, parcelas] = await Promise.all([
    getAcordoDetalhe(id, scope),
    listParcelasDoAcordo(id),
  ])

  if (!acordo) {
    notFound()
  }

  const totalParcelas = parcelas.reduce((sum: number, parcela: any) => sum + Number(parcela.valor ?? 0), 0)
  const totalPago = parcelas
    .filter((parcela: any) => parcela.status === 'paga')
    .reduce((sum: number, parcela: any) => sum + Number(parcela.valor ?? 0), 0)

  const hasVencida = parcelas.some((parcela: any) => parcela.status === 'vencida')
  const isRompido = acordo.status === 'rompido'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Acordo"
        title={`${acordo.unidades?.responsavel_nome ?? 'Responsável não informado'} · Unidade ${acordo.unidades?.identificacao ?? '-'}`}
        description={`${acordo.condominios?.nome ?? '-'} · acordo ${acordo.tipo} · criado em ${formatDateBR(acordo.data_acordo)}`}
        actions={
          <ButtonLink href="/app/acordos" variant="secondary">Voltar</ButtonLink>
        }
      />

      {isRompido || hasVencida ? (
        <Card className={isRompido ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}>
          <div className="flex items-start gap-3">
            <div className={isRompido ? 'text-red-700' : 'text-amber-700'}>
              <AlertTriangle size={22} />
            </div>
            <div>
              <h2 className={isRompido ? 'font-semibold text-red-900' : 'font-semibold text-amber-900'}>
                {isRompido ? 'Acordo rompido' : 'Acordo em atenção'}
              </h2>
              <p className={isRompido ? 'mt-1 text-sm text-red-800' : 'mt-1 text-sm text-amber-800'}>
                {isRompido
                  ? 'A cobrança vinculada deve retornar para cobrança ativa. Verifique a estratégia de reabordagem.'
                  : 'Há parcelas vencidas. Rode a verificação de status para aplicar a regra de quebra quando necessário.'}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-sm font-semibold text-slate-500">Status</p>
          <div className="mt-3">
            <StatusBadge status={acordo.status} />
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-slate-500">Valor acordado</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{formatCurrency(Number(acordo.valor_acordado))}</p>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-slate-500">Entrada</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{formatCurrency(Number(acordo.entrada))}</p>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-slate-500">Pago em parcelas</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{formatCurrency(totalPago)}</p>
          <p className="mt-1 text-sm text-slate-500">de {formatCurrency(totalParcelas)}</p>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-950">Parcelas do acordo</h2>
            <p className="mt-1 text-sm text-slate-500">Controle financeiro básico do acordo.</p>
          </div>

          <div className="divide-y divide-slate-100">
            {parcelas.map((parcela: any) => (
              <div key={parcela.id} className="grid gap-3 px-5 py-4 md:grid-cols-[90px_1fr_140px_220px] md:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-950">#{parcela.numero}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-950">{formatCurrency(Number(parcela.valor))}</p>
                  <p className="mt-1 text-xs text-slate-500">Venc. {formatDateBR(parcela.vencimento)}</p>
                </div>

                <StatusBadge status={parcela.status} />

                <div className="flex justify-end gap-2">
                  {parcela.status !== 'paga' && !isRompido ? (
                    <>
                      <form action={marcarParcelaComoPaga}>
                        <input type="hidden" name="parcela_id" value={parcela.id} />
                        <input type="hidden" name="acordo_id" value={acordo.id} />
                        <Button type="submit" variant="secondary">Pagar</Button>
                      </form>

                      <form action={marcarParcelaComoVencida}>
                        <input type="hidden" name="parcela_id" value={parcela.id} />
                        <input type="hidden" name="acordo_id" value={acordo.id} />
                        <Button type="submit" variant="danger">Vencida</Button>
                      </form>
                    </>
                  ) : parcela.status === 'paga' ? (
                    <p className="text-sm text-slate-500">Pago em {formatDateBR(parcela.data_pagamento)}</p>
                  ) : (
                    <p className="text-sm text-slate-500">Acordo rompido</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="text-lg font-semibold text-slate-950">Dados da cobrança</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Competência</span>
                <strong className="text-slate-900">{acordo.cobrancas?.competencia ?? '-'}</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Vencimento</span>
                <strong className="text-slate-900">{formatDateBR(acordo.cobrancas?.vencimento)}</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Valor atualizado</span>
                <strong className="text-slate-900">{formatCurrency(Number(acordo.cobrancas?.valor_atualizado ?? 0))}</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Status cobrança</span>
                <StatusBadge status={acordo.cobrancas?.status ?? '-'} />
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-slate-950">Contato</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>Telefone: {acordo.unidades?.telefone ?? '-'}</p>
              <p>E-mail: {acordo.unidades?.email ?? '-'}</p>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-slate-950">Observações</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {acordo.observacoes ?? 'Nenhuma observação registrada.'}
            </p>
          </Card>
        </div>
      </section>
    </div>
  )
}
