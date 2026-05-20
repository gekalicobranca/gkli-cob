import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Handshake,
  History,
  Mail,
  MessageCircle,
  Phone,
  Sparkles,
  Target,
  WalletCards,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { StatusBadge } from '@/components/data/status-badge'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import {
  getAcordoVigenteDaCobranca,
  getCobrancaDetalhe,
  listEventosOperacionaisDaCobranca,
  listInteracoesDaCobranca,
  listMensagensDaCobranca,
} from '@/features/cobrancas/queries'
import {
  agendarRetornoCobranca,
  createInteracaoCobranca,
  updateCobrancaStatus,
} from '@/features/cobrancas/actions'
import { calcularProximaAcaoCobranca } from '@/features/cobrancas/next-action'
import { CobrancaQuickActions } from '@/features/cobrancas/components/cobranca-quick-actions'
import { CobrancaTimeline } from '@/features/cobrancas/components/cobranca-timeline'
import {
  COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO,
  COBRANCA_STATUS_OPERACIONAL_LIST,
} from '@/lib/core/status'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ acao?: string; origem?: string }>
}

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function diasDeAtraso(vencimento: string | null | undefined) {
  if (!vencimento) return 0
  const base = new Date(`${vencimento}T00:00:00`)
  const hoje = new Date()
  const diff = Math.floor((hoje.getTime() - base.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
}

function getContactLabel(value?: string | null) {
  return value && value.trim().length > 0 ? value : 'Não informado'
}

function insightFromContext(input: {
  statusOperacional: string
  atraso: number
  valorNegociacao: number
  temAcordoVigente: boolean
  ultimaInteracaoAt?: string | null
}) {
  const insights = []

  if (input.temAcordoVigente) {
    insights.push('Existe acordo vigente. Prioridade é preservar cumprimento antes de reabrir negociação.')
  }

  if (input.statusOperacional === 'em_negociacao') {
    insights.push('Negociação aberta: melhor contexto para formalizar proposta e reduzir dispersão.')
  }

  if (input.atraso >= 60) {
    insights.push('Atraso superior a 60 dias. Recomenda-se abordagem objetiva com prazo de resposta.')
  } else if (input.atraso >= 30) {
    insights.push('Atraso acima de 30 dias. Caso já está maduro para proposta estruturada.')
  }

  if (input.valorNegociacao >= 10000) {
    insights.push('Valor relevante para priorização. Evite deixar o caso sem próximo passo registrado.')
  }

  if (!input.ultimaInteracaoAt) {
    insights.push('Sem interação registrada. Criar primeiro contato melhora rastreabilidade operacional.')
  }

  return insights.slice(0, 4)
}

export default async function WorkspaceOperacionalPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const query = searchParams ? await searchParams : {}
  const scope = await getPermittedCarteiras()

  const [cobranca, interacoes, acordoVigente, eventosOperacionais, mensagens] = await Promise.all([
    getCobrancaDetalhe(id, scope),
    listInteracoesDaCobranca(id),
    getAcordoVigenteDaCobranca(id),
    listEventosOperacionaisDaCobranca(id),
    listMensagensDaCobranca(id),
  ])

  if (!cobranca) notFound()

  const statusOperacional = cobranca.status_operacional ?? cobranca.status ?? 'novo'
  const statusFinanceiro = cobranca.status_financeiro ?? 'em_aberto'
  const principal = asNumber(cobranca.valor_original)
  const juros = asNumber(cobranca.juros)
  const multa = asNumber(cobranca.multa)
  const correcao = asNumber(cobranca.correcao)
  const desconto = asNumber(cobranca.desconto)
  const valorAtualizado = asNumber(cobranca.valor_atualizado) || Math.max(0, principal + juros + multa + correcao - desconto)
  const despesaCobranca = valorAtualizado * 0.1
  const valorNegociacao = valorAtualizado + despesaCobranca
  const atraso = diasDeAtraso(cobranca.vencimento)
  const canCreateAcordo =
    !acordoVigente &&
    (COBRANCA_STATUS_OPERACIONAL_LIST as string[]).includes(statusOperacional) &&
    !(COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO as string[]).includes(statusOperacional)
  const nextAction = calcularProximaAcaoCobranca({
    statusOperacional,
    statusFinanceiro,
    vencimento: cobranca.vencimento,
    valorAtualizado,
    ultimaInteracaoAt: cobranca.ultima_interacao_at,
    temAcordoVigente: Boolean(acordoVigente),
  })
  const insights = insightFromContext({
    statusOperacional,
    atraso,
    valorNegociacao,
    temAcordoVigente: Boolean(acordoVigente),
    ultimaInteracaoAt: cobranca.ultima_interacao_at,
  })

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="pointer-events-none absolute right-10 top-2 h-36 w-36 rounded-full bg-[#d7eef5] blur-3xl" />
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link href="/app/inbox" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900">
              <ArrowLeft size={16} />
              Voltar para Inbox
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#d7eef5] bg-[#edf8fb] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#04799a]">
                <Sparkles size={14} />
                Workspace Operacional
              </span>
              {query.origem === 'inbox-lite' ? (
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Aberto pela fila Lite</span>
              ) : null}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              {cobranca.unidades?.responsavel_nome ?? 'Responsável não informado'}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Unidade {cobranca.unidades?.identificacao ?? '-'} · {cobranca.condominios?.nome ?? 'Condomínio não informado'} · Competência {cobranca.competencia ?? '-'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/app/cobrancas/${cobranca.id}`} variant="secondary">
              <FileText size={16} />
              Prontuário completo
            </ButtonLink>
            {canCreateAcordo ? (
              <ButtonLink href={`/app/acordos/novo?cobranca_id=${cobranca.id}`}>
                <Handshake size={16} />
                Criar acordo
              </ButtonLink>
            ) : acordoVigente ? (
              <ButtonLink href={`/app/acordos/${acordoVigente.id}`}>
                <Handshake size={16} />
                Ver acordo
              </ButtonLink>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Próxima ação</p>
          <div className="mt-3 flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#edf8fb] text-[#04799a]"><Target size={18} /></span>
            <div>
              <p className="text-sm font-semibold text-slate-950">{nextAction.acao}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{nextAction.motivo}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Valor em negociação</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{formatCurrency(valorNegociacao)}</p>
          <p className="mt-1 text-xs text-slate-500">base + despesa de cobrança estimada</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Atraso</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{atraso} dias</p>
          <p className="mt-1 text-xs text-slate-500">vencimento {formatDateBR(cobranca.vencimento)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Status</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge status={statusOperacional} />
            <StatusBadge status={statusFinanceiro} />
          </div>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[310px_minmax(0,1fr)_360px]">
        <aside className="space-y-4">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Contato</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center gap-3 text-slate-700"><Phone size={16} className="text-slate-400" />{getContactLabel(cobranca.unidades?.telefone)}</div>
              <div className="flex items-center gap-3 text-slate-700"><Mail size={16} className="text-slate-400" />{getContactLabel(cobranca.unidades?.email)}</div>
              <div className="flex items-center gap-3 text-slate-700"><WalletCards size={16} className="text-slate-400" />Doc. {getContactLabel(cobranca.unidades?.responsavel_documento)}</div>
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Resumo financeiro</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3"><span className="text-slate-500">Principal</span><strong>{formatCurrency(principal)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Juros</span><strong>{formatCurrency(juros)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Multa</span><strong>{formatCurrency(multa)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Correção</span><strong>{formatCurrency(correcao)}</strong></div>
              <div className="border-t border-slate-100 pt-3 flex justify-between gap-3"><span className="text-slate-500">Atualizado</span><strong>{formatCurrency(valorAtualizado)}</strong></div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Mais detalhes</p>
              <ChevronDown size={16} className="text-slate-400" />
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              A complexidade avançada continua no prontuário completo: financeiro editável, auditoria, logs, automações e histórico técnico.
            </p>
          </Card>
        </aside>

        <main className="space-y-4">
          <CobrancaQuickActions
            cobranca={cobranca}
            canCreateAcordo={canCreateAcordo}
            defaultAction={query.acao ?? nextAction.acao}
            updateStatusAction={updateCobrancaStatus}
            createInteracaoAction={createInteracaoCobranca}
            agendarRetornoAction={agendarRetornoCobranca}
          />

          <Card className="p-0 overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-slate-600"><MessageCircle size={18} /></span>
                <div>
                  <h2 className="text-base font-semibold text-slate-950">Conversas e mensagens recentes</h2>
                  <p className="text-sm text-slate-500">Leitura rápida do atendimento, sem sair do case.</p>
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {mensagens.length === 0 && interacoes.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">Ainda não há mensagens ou interações registradas.</div>
              ) : null}

              {mensagens.slice(0, 4).map((mensagem: any) => (
                <div key={`msg-${mensagem.id}`} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                      <MessageCircle size={16} className="text-[#04799a]" />
                      {String(mensagem.canal ?? 'mensagem').toUpperCase()}
                    </div>
                    <span className="text-xs text-slate-400">{formatDateBR(mensagem.enviada_em ?? mensagem.created_at ?? mensagem.criado_em)}</span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{mensagem.conteudo_renderizado ?? mensagem.conteudo ?? mensagem.ultimo_erro ?? 'Mensagem registrada.'}</p>
                </div>
              ))}

              {interacoes.slice(0, 3).map((interacao: any) => (
                <div key={`int-${interacao.id}`} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                      <History size={16} className="text-slate-500" />
                      {interacao.tipo ?? 'Interação'}
                    </div>
                    <span className="text-xs text-slate-400">{formatDateBR(interacao.created_at)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{interacao.conteudo ?? 'Interação registrada.'}</p>
                </div>
              ))}
            </div>
          </Card>

          <CobrancaTimeline eventos={eventosOperacionais.slice(0, 8)} interacoes={interacoes.slice(0, 8)} />
        </main>

        <aside className="space-y-4">
          <Card className="border-[#b9e0eb] bg-gradient-to-b from-[#f4fbfd] to-white p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-[#04799a] shadow-sm"><Bot size={18} /></span>
              <div>
                <h2 className="text-base font-semibold text-slate-950">Copiloto operacional</h2>
                <p className="text-sm text-slate-500">IA contextual, sem virar módulo separado.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {insights.map((insight) => (
                <div key={insight} className="rounded-2xl border border-[#d7eef5] bg-white p-3 text-sm leading-6 text-slate-700">
                  {insight}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Acordo</p>
            {acordoVigente ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2"><CheckCircle2 size={17} className="text-emerald-600" /><span className="text-sm font-semibold text-slate-950">Acordo vigente</span></div>
                <div className="text-sm text-slate-600">Valor: <strong>{formatCurrency(asNumber(acordoVigente.valor_acordado))}</strong></div>
                {acordoVigente.proxima_parcela ? (
                  <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                    Próxima parcela: <strong>{formatCurrency(asNumber(acordoVigente.proxima_parcela.valor))}</strong><br />
                    Vencimento: {formatDateBR(acordoVigente.proxima_parcela.vencimento)}
                  </div>
                ) : null}
                <ButtonLink href={`/app/acordos/${acordoVigente.id}`} className="w-full">Abrir acordo</ButtonLink>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2"><AlertTriangle size={17} className="text-amber-600" /><span className="text-sm font-semibold text-slate-950">Sem acordo vigente</span></div>
                <p className="text-sm leading-6 text-slate-500">Use as ações rápidas para registrar contato ou formalizar proposta.</p>
                {canCreateAcordo ? <ButtonLink href={`/app/acordos/novo?cobranca_id=${cobranca.id}`} className="w-full">Criar acordo</ButtonLink> : null}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Agenda</p>
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-slate-50 p-3">
              <CalendarClock size={17} className="mt-0.5 text-slate-500" />
              <div>
                <p className="text-sm font-semibold text-slate-950">Registrar próximo passo</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">O retorno criado aqui mantém o caso visível na fila operacional.</p>
              </div>
            </div>
          </Card>
        </aside>
      </section>
    </div>
  )
}
