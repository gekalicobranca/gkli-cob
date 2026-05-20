import Link from 'next/link'
import {
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Flame,
  Handshake,
  Landmark,
  Target,
  WalletCards,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { StatusBadge } from '@/components/data/status-badge'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getCockpitInteligente } from '@/features/cockpit/queries'
import { priorityClasses, scoreBarClass } from '@/features/cockpit/rules'

function cockpitActionHref(item: { href: string; acao: string; tipo: string }) {
  const params = new URLSearchParams()
  params.set('acao', item.acao)
  return `${item.href}?${params.toString()}`
}

export default async function CockpitPage() {
  const scope = await getPermittedCarteiras()
  const cockpit = await getCockpitInteligente(scope)

  const metricCards = [
    {
      title: 'Dinheiro em risco',
      value: formatCurrency(cockpit.metrics.dinheiroEmRisco),
      description: 'acordos que exigem ação',
      icon: Flame,
      tone: 'bg-red-50 text-red-700',
    },
    {
      title: 'Potencial de conversão',
      value: formatCurrency(cockpit.metrics.potencialConversao),
      description: 'negociações quentes',
      icon: Handshake,
      tone: 'bg-amber-50 text-amber-700',
    },
    {
      title: 'Carteira acionável',
      value: formatCurrency(cockpit.metrics.carteiraAcionavel),
      description: 'valor com ação sugerida',
      icon: WalletCards,
      tone: 'bg-[var(--gkli-primary-light)] text-[var(--gkli-primary)]',
    },
    {
      title: 'Prioridades',
      value: String(cockpit.metrics.totalPrioridades),
      description: `${cockpit.metrics.criticos} críticas · ${cockpit.metrics.alta} altas`,
      icon: Target,
      tone: 'bg-blue-50 text-blue-700',
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Cockpit Inteligente"
        title="O que fazer agora"
        description="Fila priorizada por regras operacionais: dinheiro em risco, chance de conversão, timing e falta de interação. O foco é converter cobrança em acordo e proteger o cumprimento dos acordos."
        actions={
          <>
            <ButtonLink href="/app/acordos" variant="secondary">
              <Handshake size={16} />
              Ver acordos
            </ButtonLink>
            <ButtonLink href="/app/cobrancas">
              <Landmark size={16} />
              Ver cobranças
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => {
          const Icon = card.icon

          return (
            <Card key={card.title} className="relative overflow-hidden p-5">
              <div className={`absolute right-4 top-4 rounded-2xl p-2 ${card.tone}`}>
                <Icon size={18} />
              </div>

              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                {card.title}
              </p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                {card.value}
              </p>
              <p className="mt-1 text-sm text-slate-500">{card.description}</p>
            </Card>
          )
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_420px]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 bg-white/80 px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <BrainCircuit size={18} className="text-[var(--gkli-primary)]" />
                  <h2 className="text-base font-medium text-slate-950">
                    Fila inteligente do operador
                  </h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Ordenada automaticamente por impacto, urgência e probabilidade.
                </p>
              </div>

              <span className="rounded-full bg-[var(--gkli-primary-light)] px-3 py-1.5 text-xs font-medium text-[var(--gkli-primary)]">
                {cockpit.prioridadeHoje.length} ações recomendadas
              </span>
            </div>
          </div>

          {cockpit.prioridadeHoje.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="mx-auto text-emerald-600" size={32} />
              <h3 className="mt-3 text-base font-medium text-slate-950">
                Nenhuma prioridade crítica agora
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                A fila operacional não encontrou ações urgentes neste momento.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {cockpit.prioridadeHoje.map((item, index) => (
                <Link
                  key={`${item.tipo}-${item.id}`}
                  href={cockpitActionHref(item)}
                  className="group grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[52px_minmax(260px,1.4fr)_150px_170px_90px] xl:items-center"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-100 text-sm font-medium text-slate-600">
                      {index + 1}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${priorityClasses(item.prioridade)}`}>
                        {item.prioridade}
                      </span>
                      <StatusBadge status={item.status} />
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {item.origem}
                      </span>
                    </div>

                    <p className="mt-2 truncate text-sm font-medium text-slate-950">
                      {item.titulo}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {item.subtitulo}
                    </p>

                    <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2">
                      <p className="text-xs font-medium text-slate-700">
                        Próxima melhor ação: <span className="text-[var(--gkli-primary)]">{item.acao}</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{item.motivo}</p>
                      {item.ultimoEvento ? (
                        <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-400">
                          Último evento: {item.ultimoEvento.tipo}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                      Valor
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">
                      {formatCurrency(item.valor)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                      Referência
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {formatDateBR(item.dataReferencia)}
                    </p>

                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${scoreBarClass(item.prioridade)}`}
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">score {item.score}</p>
                  </div>

                  <div className="flex justify-end">
                    <span className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition group-hover:border-[var(--gkli-primary)] group-hover:text-[var(--gkli-primary)]">
                      Agir
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-medium text-slate-950">
                Acordos em risco
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Onde o dinheiro pode escapar.
              </p>
            </div>

            {cockpit.acordosEmRisco.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">
                Nenhum acordo em risco alto agora.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {cockpit.acordosEmRisco.slice(0, 5).map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block px-5 py-4 transition hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-950">
                          {item.titulo}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {item.acao}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-slate-950">
                        {formatCurrency(item.valor)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-medium text-slate-950">
                Negociações quentes
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Melhor chance de converter em acordo.
              </p>
            </div>

            {cockpit.negociacoesQuentes.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">
                Nenhuma negociação quente no momento.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {cockpit.negociacoesQuentes.slice(0, 5).map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block px-5 py-4 transition hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-950">
                          {item.titulo}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {item.motivo}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-slate-950">
                        {formatCurrency(item.valor)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-base font-medium text-slate-950">
              Como o score funciona
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>
                O cockpit combina <strong className="font-medium text-slate-800">valor</strong>,{' '}
                <strong className="font-medium text-slate-800">urgência</strong>,{' '}
                <strong className="font-medium text-slate-800">status</strong> e{' '}
                <strong className="font-medium text-slate-800">tempo sem interação</strong>.
              </p>
              <p>
                Acordos em atraso e negociações abertas sobem na fila porque impactam diretamente a recuperação financeira.
              </p>
            </div>
          </Card>
        </div>
      </section>
    </div>
  )
}
