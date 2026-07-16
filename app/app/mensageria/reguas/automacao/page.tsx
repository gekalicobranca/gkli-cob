import type { ReactNode } from 'react'
import { Activity, Bot, Clock3, PauseCircle, ShieldCheck, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getReguasR2Overview } from '@/features/reguas/r2-queries'

function fmt(value?: string | null) {
  if (!value) return '—'
  try { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) } catch { return value }
}

function tone(status?: string | null) {
  if (status === 'concluido') return 'green'
  if (status === 'erro') return 'red'
  if (status === 'processando') return 'yellow'
  return 'slate'
}

export default async function AutomacaoReguasPage() {
  const scope = await getPermittedCarteiras()
  const data = await getReguasR2Overview(scope)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mensageria · Réguas · R2"
        title="Automação, compliance e inteligência"
        description="Scheduler, pausas inteligentes, compliance operacional e score inicial das réguas."
        actions={<ButtonLink href="/app/mensageria/reguas" variant="header">Voltar às réguas</ButtonLink>}
      />

      <section className="grid gap-3 md:grid-cols-4">
        <Card className="p-4"><Metric icon={<Clock3 size={18} />} label="Jobs" value={data.metrics.jobs} detail="últimas execuções" /></Card>
        <Card className="p-4"><Metric icon={<PauseCircle size={18} />} label="Pausas" value={data.metrics.pausas} detail="ativas agora" /></Card>
        <Card className="p-4"><Metric icon={<ShieldCheck size={18} />} label="Compliance" value={data.metrics.regras} detail="regras configuradas" /></Card>
        <Card className="p-4"><Metric icon={<Sparkles size={18} />} label="Scores" value={data.metrics.scores} detail="cálculos recentes" /></Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <Card className="overflow-hidden p-0">
          <SectionHeader icon={<Activity size={18} />} title="Scheduler das réguas" detail="Execuções automáticas de cobrança e acordo." />
          <div className="divide-y divide-slate-100">
            {data.jobs.length ? data.jobs.map((job: any) => (
              <div key={job.id} className="grid gap-3 p-5 md:grid-cols-[1fr_140px_160px] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><Badge tone={tone(job.status) as any}>{job.status}</Badge><Badge tone="primary">{job.tipo}</Badge><Badge>{job.origem}</Badge></div>
                  <p className="mt-2 text-sm text-slate-500">{job.erro || 'Execução registrada sem erro crítico.'}</p>
                </div>
                <div className="text-sm text-slate-600">Início<br /><strong>{fmt(job.iniciado_em)}</strong></div>
                <div className="text-sm text-slate-600">Fim<br /><strong>{fmt(job.finalizado_em)}</strong></div>
              </div>
            )) : <Empty text="Nenhum job registrado ainda. O primeiro cron ou processamento manual preencherá este painel." />}
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <SectionHeader icon={<ShieldCheck size={18} />} title="Compliance operacional" detail="Limites de horário, intervalo, blacklist e proteção anti-assédio." />
          <div className="divide-y divide-slate-100">
            {data.regras.length ? data.regras.map((regra: any) => (
              <div key={regra.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2"><Badge tone={regra.ativo ? 'green' : 'slate'}>{regra.ativo ? 'ativa' : 'inativa'}</Badge><Badge>{regra.canal || 'todos'}</Badge></div>
                <p className="mt-3 text-sm font-semibold text-slate-950">{regra.carteiras?.nome ?? 'Regra global'}</p>
                <p className="mt-1 text-sm text-slate-500">Janela {regra.janela_inicio ?? '08:00'}–{regra.janela_fim ?? '20:00'} · limite diário {regra.limite_diario_destinatario ?? 3} · intervalo {regra.intervalo_minimo_minutos ?? 120} min</p>
              </div>
            )) : <Empty text="Sem regras específicas. O motor usa defaults seguros: 08:00–20:00, 3 contatos/dia e intervalo mínimo de 120 minutos." />}
          </div>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden p-0">
          <SectionHeader icon={<PauseCircle size={18} />} title="Suspensões inteligentes" detail="Pausas manuais ou automáticas geradas por retornos operacionais." />
          <div className="divide-y divide-slate-100">
            {data.pausas.length ? data.pausas.map((pausa: any) => (
              <div key={pausa.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2"><Badge tone="yellow">pausada</Badge><Badge>{pausa.origem}</Badge></div>
                <p className="mt-3 text-sm font-semibold text-slate-950">{pausa.motivo}</p>
                <p className="mt-1 text-sm text-slate-500">Até {fmt(pausa.pausa_ate)} · {pausa.carteiras?.nome ?? 'Global'}</p>
              </div>
            )) : <Empty text="Nenhuma pausa ativa. Retornos como promessa, contestação ou jurídico poderão pausar a régua automaticamente." />}
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <SectionHeader icon={<Bot size={18} />} title="Inteligência operacional" detail="Score inicial calculado a partir de atraso, valor, canal e histórico de retorno." />
          <div className="divide-y divide-slate-100">
            {data.scores.length ? data.scores.map((score: any) => (
              <div key={score.id} className="grid gap-3 p-5 md:grid-cols-[120px_1fr]">
                <div><p className="text-3xl text-slate-950">{score.score_recuperacao}</p><p className="text-xs uppercase tracking-[0.14em] text-slate-400">recuperação</p></div>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><Badge tone={score.risco_quebra > 70 ? 'red' : score.risco_quebra > 45 ? 'yellow' : 'green'}>risco {score.risco_quebra}</Badge><Badge>{score.melhor_canal}</Badge><Badge tone="primary">{score.intensidade_sugerida}</Badge></div>
                  <p className="mt-2 text-sm text-slate-500">{score.recomendacao}</p>
                </div>
              </div>
            )) : <Empty text="Scores aparecem conforme o scheduler/processamento das réguas avalia cobranças e acordos." />}
          </div>
        </Card>
      </section>
    </div>
  )
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: number; detail: string }) {
  return <div><div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-400">{icon}{label}</div><p className="mt-3 text-3xl text-slate-950">{value}</p><p className="mt-1 text-sm text-slate-500">{detail}</p></div>
}

function SectionHeader({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="border-b border-slate-100 p-5"><div className="flex items-center gap-2 text-sm text-slate-500">{icon}{title}</div><p className="mt-2 text-sm text-slate-500">{detail}</p></div>
}

function Empty({ text }: { text: string }) {
  return <div className="p-6 text-sm text-slate-500">{text}</div>
}
