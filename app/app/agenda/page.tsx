import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Handshake,
  MessageCircle,
  Sparkles,
  Target,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { StatusBadge } from '@/components/data/status-badge'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getCockpitInteligente } from '@/features/cockpit/queries'
import { priorityClasses } from '@/features/cockpit/rules'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'

export const dynamic = 'force-dynamic'

type AgendaItem = {
  id: string
  titulo: string
  subtitulo: string
  horario: string
  tipo: 'cobranca' | 'acordo' | 'negociacao' | 'retorno'
  prioridade: 'alta' | 'media' | 'baixa'
  valor?: number | null
  status?: string | null
  href: string
  acao: string
  sugestao?: string | null
}

function toCurrency(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? formatCurrency(parsed) : formatCurrency(0)
}

function workspaceHref(item: { id: string; href?: string; acao: string; tipo?: string }) {
  const params = new URLSearchParams()
  params.set('acao', item.acao)
  params.set('origem', 'agenda-lite')

  if (!item.tipo || item.tipo === 'cobranca') {
    return `/app/workspace/${item.id}?${params.toString()}`
  }

  return `${item.href ?? '/app/inbox'}?${params.toString()}`
}

function hourFromIndex(index: number) {
  const base = 9 + Math.min(index, 8)
  return `${String(base).padStart(2, '0')}:00`
}

function agendaTypeClasses(tipo: AgendaItem['tipo']) {
  switch (tipo) {
    case 'acordo':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'negociacao':
      return 'border-sky-200 bg-sky-50 text-sky-700'
    case 'retorno':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    default:
      return 'border-rose-200 bg-rose-50 text-rose-700'
  }
}

function priorityLabel(prioridade: AgendaItem['prioridade']) {
  if (prioridade === 'alta') return 'Alta'
  if (prioridade === 'media') return 'Média'
  return 'Baixa'
}

function buildAgenda(cockpit: Awaited<ReturnType<typeof getCockpitInteligente>>) {
  const hoje: AgendaItem[] = cockpit.prioridadeHoje.slice(0, 8).map((item, index) => ({
    id: item.id,
    titulo: item.titulo,
    subtitulo: item.descricao ?? item.condominio ?? 'Cobrança operacional',
    horario: hourFromIndex(index),
    tipo: 'cobranca',
    prioridade: item.prioridade === 'alta' ? 'alta' : item.prioridade === 'media' ? 'media' : 'baixa',
    valor: item.valor,
    status: item.status,
    href: item.href,
    acao: item.acao,
    sugestao: item.sugestao,
  }))

  const acordos: AgendaItem[] = cockpit.acordosEmRisco.slice(0, 5).map((item, index) => ({
    id: item.id,
    titulo: item.titulo,
    subtitulo: item.descricao ?? 'Acordo precisa de acompanhamento',
    horario: hourFromIndex(index + 2),
    tipo: 'acordo',
    prioridade: 'alta',
    valor: item.valor,
    status: item.status,
    href: item.href,
    acao: item.acao,
    sugestao: item.sugestao ?? 'Proteger acordo antes de reabrir cobrança.',
  }))

  const negociacoes: AgendaItem[] = cockpit.negociacoesQuentes.slice(0, 5).map((item, index) => ({
    id: item.id,
    titulo: item.titulo,
    subtitulo: item.descricao ?? 'Negociação em andamento',
    horario: hourFromIndex(index + 4),
    tipo: 'negociacao',
    prioridade: item.prioridade === 'alta' ? 'alta' : 'media',
    valor: item.valor,
    status: item.status,
    href: item.href,
    acao: item.acao,
    sugestao: item.sugestao ?? 'Retomar conversa com proposta objetiva.',
  }))

  const retornos: AgendaItem[] = cockpit.itens
    .filter((item) => item.ultimaInteracaoAt)
    .sort((a, b) => String(a.ultimaInteracaoAt).localeCompare(String(b.ultimaInteracaoAt)))
    .slice(0, 6)
    .map((item, index) => ({
      id: item.id,
      titulo: item.titulo,
      subtitulo: item.descricao ?? `Último contato em ${formatDateBR(item.ultimaInteracaoAt)}`,
      horario: hourFromIndex(index + 3),
      tipo: 'retorno',
      prioridade: item.prioridade === 'alta' ? 'alta' : item.prioridade === 'media' ? 'media' : 'baixa',
      valor: item.valor,
      status: item.status,
      href: item.href,
      acao: 'retomar_contato',
      sugestao: item.sugestao ?? 'Retomar contato e registrar próximo passo.',
    }))

  const timeline = [...hoje, ...acordos, ...negociacoes, ...retornos]
    .sort((a, b) => a.horario.localeCompare(b.horario))
    .slice(0, 18)

  return { hoje, acordos, negociacoes, retornos, timeline }
}

export default async function AgendaOperacionalPage() {
  const scope = await getPermittedCarteiras()
  const cockpit = await getCockpitInteligente(scope)
  const agenda = buildAgenda(cockpit)

  const totalAlta = agenda.timeline.filter((item) => item.prioridade === 'alta').length
  const totalMedia = agenda.timeline.filter((item) => item.prioridade === 'media').length
  const totalBaixa = agenda.timeline.filter((item) => item.prioridade === 'baixa').length

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="pointer-events-none absolute right-8 top-4 h-32 w-32 rounded-full bg-[#d7eef5] blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d7eef5] bg-[#edf8fb] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#04799a]">
              <CalendarClock size={14} />
              Agenda Lite
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Agenda, retornos e promessas
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              A agenda traduz cobranças, acordos e negociações em compromissos operacionais. O operador trabalha pelo que precisa de ação hoje, sem navegar por telas técnicas.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/app/inbox" variant="secondary">
              <Target size={16} />
              Voltar ao Inbox
            </ButtonLink>
            <ButtonLink href="/app/cobrancas" variant="secondary">
              Cobranças
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-3xl border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Compromissos</span>
            <CalendarClock size={18} className="text-[#04799a]" />
          </div>
          <strong className="mt-3 block text-3xl font-semibold text-slate-950">{agenda.timeline.length}</strong>
          <p className="mt-1 text-sm text-slate-500">Ações organizadas para hoje.</p>
        </Card>

        <Card className="rounded-3xl border-rose-200 bg-rose-50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">Alta prioridade</span>
            <AlertTriangle size={18} className="text-rose-600" />
          </div>
          <strong className="mt-3 block text-3xl font-semibold text-rose-950">{totalAlta}</strong>
          <p className="mt-1 text-sm text-rose-700">Tratar antes do fim do dia.</p>
        </Card>

        <Card className="rounded-3xl border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Média</span>
            <Clock3 size={18} className="text-amber-600" />
          </div>
          <strong className="mt-3 block text-3xl font-semibold text-amber-950">{totalMedia}</strong>
          <p className="mt-1 text-sm text-amber-700">Acompanhar em sequência.</p>
        </Card>

        <Card className="rounded-3xl border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Baixa</span>
            <CheckCircle2 size={18} className="text-emerald-600" />
          </div>
          <strong className="mt-3 block text-3xl font-semibold text-emerald-950">{totalBaixa}</strong>
          <p className="mt-1 text-sm text-emerald-700">Entram após os críticos.</p>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="rounded-[2rem] border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Roteiro do dia</h2>
              <p className="text-sm text-slate-500">Fila cronológica com o próximo passo recomendado.</p>
            </div>
            <ButtonLink href="/app/inbox?fila=hoje" variant="secondary">
              Ver Inbox
              <ArrowRight size={16} />
            </ButtonLink>
          </div>

          <div className="mt-4 space-y-3">
            {agenda.timeline.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center">
                <Sparkles className="mx-auto text-slate-400" size={28} />
                <h3 className="mt-3 text-sm font-semibold text-slate-900">Agenda limpa</h3>
                <p className="mt-1 text-sm text-slate-500">Nenhuma ação prioritária foi encontrada para hoje.</p>
              </div>
            ) : (
              agenda.timeline.map((item) => (
                <Link
                  key={`${item.tipo}-${item.id}-${item.horario}`}
                  href={workspaceHref(item)}
                  className="group grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 transition hover:border-[#04799a]/30 hover:bg-[#f8fcfd] hover:shadow-sm md:grid-cols-[76px_minmax(0,1fr)_150px_120px_32px]"
                >
                  <div>
                    <span className="inline-flex rounded-2xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white">
                      {item.horario}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${agendaTypeClasses(item.tipo)}`}>
                        {item.tipo === 'cobranca' && 'Cobrança'}
                        {item.tipo === 'acordo' && 'Acordo'}
                        {item.tipo === 'negociacao' && 'Negociação'}
                        {item.tipo === 'retorno' && 'Retorno'}
                      </span>
                      {item.status ? <StatusBadge status={item.status} /> : null}
                    </div>
                    <strong className="mt-2 block truncate text-sm font-semibold text-slate-950">{item.titulo}</strong>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.subtitulo}</p>
                    {item.sugestao ? (
                      <p className="mt-2 line-clamp-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">Sugestão: </span>
                        {item.sugestao}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-sm">
                    <span className="block text-xs font-medium text-slate-400">Valor</span>
                    <strong className="text-slate-950">{toCurrency(item.valor)}</strong>
                  </div>

                  <div>
                    <span className={priorityClasses(item.prioridade)}>
                      {priorityLabel(item.prioridade)}
                    </span>
                  </div>

                  <div className="flex items-center justify-end text-slate-400 transition group-hover:text-[#04799a]">
                    <ArrowRight size={18} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        <aside className="space-y-4">
          <Card className="rounded-[2rem] border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-[#04799a]" />
              <h2 className="text-sm font-semibold text-slate-950">Como usar</h2>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <p>
                Comece pelos itens de alta prioridade. Cada compromisso abre o Workspace com contexto completo, sem perder a tela antiga.
              </p>
              <p>
                A agenda não substitui cobranças, acordos ou pendências. Ela só transforma tudo em roteiro operacional.
              </p>
            </div>
          </Card>

          <Card className="rounded-[2rem] border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">Atalhos rápidos</h2>
            <div className="mt-4 grid gap-2">
              <ButtonLink href="/app/inbox?fila=criticos" variant="secondary">
                <AlertTriangle size={16} />
                Críticos
              </ButtonLink>
              <ButtonLink href="/app/inbox?fila=acordos" variant="secondary">
                <Handshake size={16} />
                Acordos em risco
              </ButtonLink>
              <ButtonLink href="/app/inbox?fila=negociacoes" variant="secondary">
                <MessageCircle size={16} />
                Negociações
              </ButtonLink>
              <ButtonLink href="/app/inbox?fila=sem-retorno" variant="secondary">
                <Clock3 size={16} />
                Sem retorno
              </ButtonLink>
            </div>
          </Card>

          <Card className="rounded-[2rem] border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">Regra operacional</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              A agenda deve ser simples: poucos agrupamentos, ações claras e abertura direta no case operacional.
            </p>
          </Card>
        </aside>
      </section>
    </div>
  )
}
