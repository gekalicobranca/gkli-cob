import Link from 'next/link'
import { Activity, AlertTriangle, ArrowUpRight, Brain, Gauge, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/data/empty-state'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { formatDateBR } from '@/utils/formatters/date'
import { getInteligenciaOperacional } from '@/features/operacional/queries'

function toneForSeverity(severidade: string) {
  if (severidade === 'critico') return 'red' as const
  if (severidade === 'alerta') return 'yellow' as const
  if (severidade === 'sucesso') return 'green' as const
  return 'blue' as const
}

export default async function InteligenciaPage() {
  const scope = await getPermittedCarteiras()
  const data = await getInteligenciaOperacional(scope)

  const cards = [
    {
      label: 'Entidades monitoradas',
      value: data.metrics.entidadesMonitoradas,
      description: 'com estado operacional formal',
      icon: Gauge,
    },
    {
      label: 'Eventos recentes',
      value: data.metrics.eventosRecentes,
      description: 'registrados na trilha operacional',
      icon: Activity,
    },
    {
      label: 'Críticos',
      value: data.metrics.criticos,
      description: 'exigem atenção imediata',
      icon: AlertTriangle,
    },
    {
      label: 'Score médio',
      value: data.metrics.scoreMedio.toFixed(1),
      description: 'base para priorização IA/BI',
      icon: Brain,
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Inteligência operacional"
        title="Cockpit IA e BI preditivo"
        description="Primeira camada de inteligência sobre eventos, estados formais, alertas e priorização operacional."
        actions={
          <ButtonLink href="/app/automacoes" variant="secondary">
            Automação visual
            <ArrowUpRight size={16} />
          </ButtonLink>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.label} className="relative overflow-hidden p-5">
              <div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
                <Icon size={18} />
              </div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{card.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{card.value}</p>
              <p className="mt-1 text-sm text-slate-500">{card.description}</p>
            </Card>
          )
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-[var(--gkli-primary)]" />
              <h2 className="text-base font-medium text-slate-950">Priorização operacional</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">Entidades com estado formal e próxima ação sugerida.</p>
          </div>

          {data.estados.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nenhum estado operacional sincronizado"
                description="Aplique o SQL do P1-A e gere/atualize cobranças para alimentar a engine."
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.estados.slice(0, 12).map((estado: any) => (
                <div key={`${estado.entidade_tipo}-${estado.entidade_id}`} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_120px_120px] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="primary">{estado.entidade_tipo}</Badge>
                      <Badge>{estado.estado_nome ?? estado.estado_codigo}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{estado.proxima_acao ?? 'Sem ação sugerida no momento.'}</p>
                    {estado.motivo_prioridade ? (
                      <p className="mt-1 text-xs text-slate-500">{estado.motivo_prioridade}</p>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Score</p>
                    <p className="mt-1 text-sm text-slate-800">{Number(estado.score_prioridade ?? 0).toFixed(1)}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Atualizado</p>
                    <p className="mt-1 text-sm text-slate-800">{formatDateBR(estado.atualizado_em)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-medium text-slate-950">Eventos recentes</h2>
            <p className="mt-1 text-sm text-slate-500">Trilha operacional para auditoria e automações.</p>
          </div>

          {data.eventos.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Nenhum evento registrado" description="Os próximos movimentos da operação aparecerão aqui." />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.eventos.slice(0, 14).map((evento: any) => (
                <div key={evento.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone={toneForSeverity(evento.severidade)}>{evento.severidade}</Badge>
                    <span className="text-xs text-slate-400">{formatDateBR(evento.criado_em)}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-950">{evento.titulo}</p>
                  <p className="mt-1 text-xs text-slate-500">{evento.evento_codigo} · {evento.entidade_tipo}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <Card className="border-dashed bg-slate-50 p-5">
        <p className="text-sm text-slate-700">
          Próximo encaixe: alimentar score e próxima ação automaticamente a partir de vencimento, última interação, status de acordo,
          aging e histórico de resposta. O cockpit atual já está preparado para consumir esses campos.
        </p>
        <Link href="/app" className="mt-3 inline-flex text-sm font-medium text-[var(--gkli-primary)]">
          Voltar ao cockpit principal
        </Link>
      </Card>
    </div>
  )
}
