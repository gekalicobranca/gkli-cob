import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { getAcordoDetalhe } from '@/features/acordos/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

type Props = {
  params: Promise<{
    id: string
  }>
}

function formatCurrency(value?: number | null) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDate(value?: string | null) {
  if (!value) return '-'

  return new Intl.DateTimeFormat('pt-BR').format(new Date(value))
}

function normalizeLabel(value?: string | null) {
  if (!value) return '-'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function badgeTone(value?: string | null) {
  const v = String(value || '').toLowerCase()

  if (['ativo', 'adimplente', 'quitado', 'baixo'].includes(v)) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  }

  if (['parcial', 'medio', 'médio', 'em atraso'].includes(v)) {
    return 'bg-amber-50 text-amber-700 ring-amber-200'
  }

  if (['rompido', 'inadimplente', 'alto', 'cancelado'].includes(v)) {
    return 'bg-rose-50 text-rose-700 ring-rose-200'
  }

  return 'bg-sky-50 text-sky-700 ring-sky-200'
}

function Badge({ value }: { value?: string | null }) {
  return (
    <span
      className={[
        'inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1',
        badgeTone(value),
      ].join(' ')}
    >
      {normalizeLabel(value)}
    </span>
  )
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper?: string
}) {
  return (
    <Card>
      <CardContent className="flex min-h-[112px] items-center gap-4 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-lg text-sky-700 ring-1 ring-sky-100">
          ●
        </div>

        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {label}
          </div>

          <div className="mt-1 truncate text-xl font-semibold text-slate-950">
            {value}
          </div>

          {helper && (
            <div className="mt-1 text-sm text-slate-500">
              {helper}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function SectionTitle({
  title,
  description,
  count,
}: {
  title: string
  description?: string
  count?: number
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-950">
            {title}
          </h2>

          {typeof count === 'number' && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
              {count}
            </span>
          )}
        </div>

        {description && (
          <p className="mt-1 text-sm text-slate-500">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}

export default async function AcordoDetalhePage({ params }: Props) {
  const { id } = await params
  const scope = await getPermittedCarteiras()
  const data = await getAcordoDetalhe(id, scope)

  if (!data?.acordo) notFound()

  const { acordo, parcelas, timeline } = data

  const entrada = parcelas.find((parcela: any) => parcela.tipo === 'entrada')
  const parcelasNormais = parcelas.filter((parcela: any) => parcela.tipo !== 'entrada')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GKLI Cobrança"
        title="Acordo operacional"
        description="Gestão completa do acordo, entrada, parcelas e acompanhamento operacional."
        actions={
          <div className="flex gap-2">
            <Link
              href={`/app/cobrancas/${acordo.cobranca_id}`}
              className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
            >
              Ver cobrança
            </Link>

            <Link
              href="/app/acordos"
              className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
            >
              Voltar
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          label="Status"
          value={normalizeLabel(acordo.status)}
          helper="Situação operacional"
        />

        <MetricCard
          label="Financeiro"
          value={normalizeLabel(acordo.status_financeiro)}
          helper="Acompanhamento de pagamento"
        />

        <MetricCard
          label="Valor do acordo"
          value={formatCurrency(acordo.valor_acordado)}
          helper="Total negociado"
        />

        <MetricCard
          label="Risco"
          value={normalizeLabel(acordo.risco)}
          helper="Risco de rompimento"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardContent className="space-y-5 p-6">
            <SectionTitle
              title="Entrada"
              description="Primeiro pagamento do acordo."
            />

            {!entrada ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-5">
                <div className="text-2xl font-semibold text-slate-950">
                  Sem entrada
                </div>

                <p className="mt-2 text-sm text-slate-500">
                  Este acordo não possui parcela de entrada cadastrada.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-3xl font-semibold text-slate-950">
                      {formatCurrency(entrada.valor)}
                    </div>

                    <div className="mt-2 text-sm text-slate-500">
                      Vencimento: {formatDate(entrada.vencimento)}
                    </div>
                  </div>

                  <Badge value={entrada.status} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardContent className="space-y-5 p-6">
            <SectionTitle
              title="Origem do acordo"
              description="Cobrança e unidade relacionadas ao acordo."
            />

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
              <div className="text-lg font-semibold text-slate-950">
                {acordo.condominios?.nome || 'Condomínio não informado'}
              </div>

              <div className="mt-1 text-sm text-slate-500">
                Unidade {acordo.unidades?.identificacao || '-'}
                {acordo.unidades?.bloco ? ` • Bloco ${acordo.unidades.bloco}` : ''}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Valor cobrança
                </div>

                <div className="mt-2 text-lg font-semibold text-slate-950">
                  {formatCurrency(acordo.cobrancas?.valor_atualizado)}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Principal
                </div>

                <div className="mt-2 text-lg font-semibold text-slate-950">
                  {formatCurrency(acordo.cobrancas?.valor_original)}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Vencimento
                </div>

                <div className="mt-2 text-lg font-semibold text-slate-950">
                  {formatDate(acordo.cobrancas?.vencimento)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardContent className="space-y-5 p-6">
            <SectionTitle
              title="Parcelas do acordo"
              description="Acompanhamento operacional do parcelamento."
              count={parcelasNormais.length}
            />

            {parcelasNormais.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
                  □
                </div>

                <div className="font-semibold text-slate-950">
                  Nenhuma parcela cadastrada
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  Este acordo ainda não possui parcelas.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {parcelasNormais.map((parcela: any) => (
                  <div
                    key={parcela.id}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 p-4"
                  >
                    <div>
                      <div className="font-semibold text-slate-950">
                        Parcela #{parcela.numero}
                      </div>

                      <div className="mt-1 text-sm text-slate-500">
                        Vencimento: {formatDate(parcela.vencimento)}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-semibold text-slate-950">
                        {formatCurrency(parcela.valor)}
                      </div>

                      <div className="mt-1">
                        <Badge value={parcela.status} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-5 p-6">
            <SectionTitle
              title="Timeline operacional"
              description="Eventos registrados neste acordo."
              count={timeline.length}
            />

            {timeline.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
                  ○
                </div>

                <div className="font-semibold text-slate-950">
                  Nenhum evento registrado
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  A timeline deste acordo está vazia.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {timeline.map((evento: any) => (
                  <div
                    key={evento.id}
                    className="relative border-l border-slate-200 pl-5"
                  >
                    <div className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-sky-600" />

                    <div className="font-semibold text-slate-950">
                      {evento.descricao}
                    </div>

                    <div className="mt-1 text-sm text-slate-500">
                      {formatDate(evento.criado_em)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}