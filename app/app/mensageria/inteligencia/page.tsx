import Link from 'next/link'
import type { ElementType } from 'react'
import { ArrowUpRight, BrainCircuit, Clock3, Gauge, MessageSquareWarning, Sparkles, Target, Wand2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getMensageriaInteligencia } from '@/features/mensageria/inteligencia'

type Tone = 'slate' | 'green' | 'yellow' | 'red' | 'blue' | 'indigo' | 'primary'

function toneForPriority(priority: string): Tone {
  if (priority === 'critica') return 'red'
  if (priority === 'alta') return 'yellow'
  if (priority === 'media') return 'blue'
  return 'green'
}

function percent(value: number) {
  return `${Math.round(value)}%`
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string
  value: string | number
  description: string
  icon: ElementType
}) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
        <Icon size={18} />
      </div>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </Card>
  )
}

export default async function MensageriaInteligenciaPage() {
  const scope = await getPermittedCarteiras()
  const data = await getMensageriaInteligencia(scope)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="P3.8 · Inteligência operacional"
        title="Inteligência da mensageria"
        description="Priorize mensagens, antecipe gargalos e receba recomendações de canal, horário e template sem depender de serviço externo."
        actions={
          <ButtonLink href="/app/mensageria" variant="secondary">
            Voltar à mensageria
            <ArrowUpRight size={16} />
          </ButtonLink>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Monitoradas"
          value={data.metrics.mensagensMonitoradas}
          description="últimas mensagens analisadas"
          icon={BrainCircuit}
        />
        <MetricCard
          label="Pendentes"
          value={data.metrics.pendentes}
          description="aguardando aprovação operacional"
          icon={Target}
        />
        <MetricCard
          label="Falhas"
          value={data.metrics.falhas}
          description="exigem ajuste antes de reenviar"
          icon={MessageSquareWarning}
        />
        <MetricCard
          label="Engajamento"
          value={percent(data.metrics.scoreMedioEngajamento)}
          description={`risco médio de não resposta: ${percent(data.metrics.riscoMedioNaoResposta)}`}
          icon={Gauge}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_.95fr]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-[var(--gkli-primary)]" />
              <h2 className="text-base font-semibold text-slate-950">Alertas inteligentes</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Gargalos operacionais calculados por regras de status, tentativas, canal e histórico recente.
            </p>
          </div>

          {data.insights.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Sem alertas no momento"
                description="Quando houver falhas, pendências ou risco de não resposta, os alertas aparecem aqui."
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.insights.map((insight) => (
                <div key={insight.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={toneForPriority(insight.prioridade)}>{insight.prioridade}</Badge>
                      <Badge tone="slate">{insight.tipo}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{insight.titulo}</p>
                    <p className="mt-1 text-sm text-slate-500">{insight.descricao}</p>
                  </div>

                  {insight.href ? (
                    <Link
                      href={insight.href}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                    >
                      {insight.acao}
                      <ArrowUpRight size={14} />
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <Wand2 size={18} className="text-[var(--gkli-primary)]" />
              <h2 className="text-base font-semibold text-slate-950">Recomendações de ação</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Sugestões leves de canal, template e horário para reduzir retrabalho do operador.
            </p>
          </div>

          {data.recomendacoes.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nenhuma recomendação prioritária"
                description="A operação está sem mensagens com risco relevante no recorte atual."
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recomendacoes.map((rec) => (
                <div key={rec.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone={toneForPriority(rec.riscoNaoResposta >= 80 ? 'critica' : rec.riscoNaoResposta >= 60 ? 'alta' : 'media')}>
                      risco {percent(rec.riscoNaoResposta)}
                    </Badge>
                    <span className="text-xs text-slate-400">score {percent(rec.scoreEngajamento)}</span>
                  </div>

                  <p className="mt-2 text-sm font-medium text-slate-950">{rec.motivo}</p>

                  <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="font-medium text-slate-900">Canal</p>
                      <p className="mt-1">{rec.canalAtual} → {rec.canalSugerido}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="font-medium text-slate-900">Horário</p>
                      <p className="mt-1">{rec.horarioSugerido}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="font-medium text-slate-900">Template</p>
                      <p className="mt-1">{rec.templateSugerido}</p>
                    </div>
                  </div>

                  {rec.href ? (
                    <Link
                      href={rec.href}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--gkli-primary)]"
                    >
                      Abrir contexto
                      <ArrowUpRight size={14} />
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <Card className="border-dashed bg-slate-50 p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="rounded-2xl bg-white p-2 text-[var(--gkli-primary)] shadow-sm">
            <Clock3 size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-950">Camada sem IA externa</p>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Esta sprint usa regras operacionais internas para priorizar mensagens. Quando a IA externa entrar, ela pode consumir os mesmos sinais: status, tentativas, canal, template, retorno e histórico de eventos.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
