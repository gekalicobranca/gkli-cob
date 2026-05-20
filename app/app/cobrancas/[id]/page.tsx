import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/data/status-badge'
import { formatCurrency } from '@/utils/formatters/currency'
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
  updateCobrancaFinanceiro,
  updateCobrancaStatus,
} from '@/features/cobrancas/actions'
import { calcularProximaAcaoCobranca } from '@/features/cobrancas/next-action'
import { CobrancaFinanceiroCard } from '@/features/cobrancas/components/cobranca-financeiro-card'
import { CobrancaMensageriaCard } from '@/features/cobrancas/components/cobranca-mensageria-card'
import { CobrancaNextActionCard } from '@/features/cobrancas/components/cobranca-next-action-card'
import { CobrancaQuickActions } from '@/features/cobrancas/components/cobranca-quick-actions'
import { CobrancaProntuarioHeader } from '@/features/cobrancas/components/cobranca-prontuario-header'
import { CobrancaSideCards } from '@/features/cobrancas/components/cobranca-side-cards'
import { CobrancaStatusActions } from '@/features/cobrancas/components/cobranca-status-actions'
import { CobrancaTimeline } from '@/features/cobrancas/components/cobranca-timeline'
import {
  COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO,
  COBRANCA_STATUS_OPERACIONAL_LIST,
} from '@/lib/core/status'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ acao?: string }>
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

export default async function CobrancaDetalhePage({ params, searchParams }: PageProps) {
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
  const canCreateAcordo =
    !acordoVigente &&
    (COBRANCA_STATUS_OPERACIONAL_LIST as string[]).includes(statusOperacional) &&
    !(COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO as string[]).includes(statusOperacional)

  const principal = asNumber(cobranca.valor_original)
  const juros = asNumber(cobranca.juros)
  const multa = asNumber(cobranca.multa)
  const correcao = asNumber(cobranca.correcao)
  const desconto = asNumber(cobranca.desconto)
  const atualizadoCalculado = Math.max(0, principal + juros + multa + correcao - desconto)
  const valorAtualizado = asNumber(cobranca.valor_atualizado) || atualizadoCalculado
  const percentualDespesa = 10
  const despesaCobranca = valorAtualizado * (percentualDespesa / 100)
  const valorNegociacao = valorAtualizado + despesaCobranca
  const atraso = diasDeAtraso(cobranca.vencimento)
  const nextAction = calcularProximaAcaoCobranca({
    statusOperacional,
    statusFinanceiro,
    vencimento: cobranca.vencimento,
    valorAtualizado,
    ultimaInteracaoAt: cobranca.ultima_interacao_at,
    temAcordoVigente: Boolean(acordoVigente),
  })

  return (
    <div className="space-y-6">
      <CobrancaProntuarioHeader
        cobranca={cobranca}
        statusOperacional={statusOperacional}
        valorAtualizado={valorAtualizado}
        atraso={atraso}
        nextAction={nextAction}
        acordoVigenteId={acordoVigente?.id ?? null}
        canCreateAcordo={canCreateAcordo}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-sm font-semibold text-slate-500">Status operacional</p>
          <div className="mt-3"><StatusBadge status={statusOperacional} /></div>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-slate-500">Status financeiro</p>
          <div className="mt-3"><StatusBadge status={statusFinanceiro} /></div>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-slate-500">Dias em atraso</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{atraso}</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-slate-500">Valor em negociação</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{formatCurrency(valorNegociacao)}</p>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <CobrancaQuickActions
            cobranca={cobranca}
            canCreateAcordo={canCreateAcordo}
            defaultAction={query.acao ?? nextAction.acao}
            updateStatusAction={updateCobrancaStatus}
            createInteracaoAction={createInteracaoCobranca}
            agendarRetornoAction={agendarRetornoCobranca}
          />
          <CobrancaNextActionCard action={nextAction} />
          <CobrancaFinanceiroCard
            cobranca={cobranca}
            principal={principal}
            juros={juros}
            multa={multa}
            correcao={correcao}
            desconto={desconto}
            valorAtualizado={valorAtualizado}
            despesaCobranca={despesaCobranca}
            valorNegociacao={valorNegociacao}
            updateAction={updateCobrancaFinanceiro}
          />
          <CobrancaStatusActions
            cobranca={cobranca}
            statusOperacional={statusOperacional}
            statusFinanceiro={statusFinanceiro}
            updateStatusAction={updateCobrancaStatus}
            createInteracaoAction={createInteracaoCobranca}
          />
          <CobrancaTimeline eventos={eventosOperacionais} interacoes={interacoes} />
        </div>

        <div className="space-y-4">
          <CobrancaMensageriaCard
            mensagens={mensagens}
            telefone={cobranca.unidades?.telefone}
            responsavel={cobranca.unidades?.responsavel_nome}
          />
          <CobrancaSideCards cobranca={cobranca} acordoVigente={acordoVigente} statusOperacional={statusOperacional} />
        </div>
      </section>
    </div>
  )
}
