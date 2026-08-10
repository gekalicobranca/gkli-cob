import { Activity, Braces, PlayCircle, Workflow } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/data/empty-state'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { formatDateBR } from '@/utils/formatters/date'
import { listAutomacoes, listExecucoesAutomacao } from '@/features/operacional/queries'

function statusTone(status: string) {
  if (status === 'concluida') return 'green' as const
  if (status === 'erro') return 'red' as const
  if (status === 'executando') return 'blue' as const
  return 'slate' as const
}

export default async function AutomacoesPage() {
  const scope = await getPermittedCarteiras()
  const [fluxos, execucoes] = await Promise.all([
    listAutomacoes(scope),
    listExecucoesAutomacao(scope),
  ])

  const ativos = fluxos.filter((fluxo: any) => fluxo.ativo).length
  const acoesConfiguradas = fluxos.reduce((sum: number, fluxo: any) => sum + Object.keys(fluxo.acoes ?? {}).length, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Automação operacional"
        title="Automações operacionais"
        description="Camada consolidada de gatilhos, condições e ações cadastradas na tabela automacoes."
        actions={
          <ButtonLink href="/app/inteligencia" variant="secondary">
            Inteligência
          </ButtonLink>
        }
      />

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Fluxos</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{fluxos.length}</p>
            </div>
            <Workflow size={22} className="text-[var(--gkli-primary)]" />
          </div>
          <p className="mt-1 text-sm text-slate-500">desenhados na operação</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Ativos</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{ativos}</p>
            </div>
            <PlayCircle size={22} className="text-[var(--gkli-primary)]" />
          </div>
          <p className="mt-1 text-sm text-slate-500">liberados para execução</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Ações</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{acoesConfiguradas}</p>
            </div>
            <Braces size={22} className="text-[var(--gkli-primary)]" />
          </div>
          <p className="mt-1 text-sm text-slate-500">ações declaradas em JSON</p>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <Card className="overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-medium text-slate-950">Automações configuradas</h2>
              <p className="mt-1 text-sm text-slate-500">Tela consolidada sobre o schema atual: automacoes e automacoes_execucoes.</p>
            </div>

          </div>

          {fluxos.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nenhuma automação criada"
                description="As automações cadastradas aparecerão aqui assim que forem criadas no módulo administrativo."
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {fluxos.map((fluxo: any) => (
                <div key={fluxo.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_120px_140px] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-950">{fluxo.nome}</p>
                      <Badge tone={fluxo.ativo ? 'green' : 'slate'}>{fluxo.ativo ? 'ativo' : 'rascunho'}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{fluxo.descricao ?? 'Sem descrição.'}</p>
                    <p className="mt-1 text-xs text-slate-400">Gatilho: {fluxo.gatilho}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Condições</p>
                    <p className="mt-1 text-sm text-slate-700">{Object.keys(fluxo.condicoes ?? {}).length}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Ações</p>
                    <p className="mt-1 text-sm text-slate-700">{Object.keys(fluxo.acoes ?? {}).length}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-[var(--gkli-primary)]" />
              <h2 className="text-base font-medium text-slate-950">Execuções recentes</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">Fila operacional preparada para jobs e retries.</p>
          </div>

          {execucoes.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Nenhuma execução registrada" description="As automações executadas aparecerão aqui." />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {execucoes.map((execucao: any) => (
                <div key={execucao.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={statusTone(execucao.status)}>{execucao.status}</Badge>
                    <span className="text-xs text-slate-400">{formatDateBR(execucao.executado_em ?? execucao.created_at)}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{execucao.cobranca_id ? `Cobrança · ${execucao.cobranca_id}` : `Automação · ${execucao.automacao_id ?? execucao.id}`}</p>
                  {execucao.erro ? <p className="mt-1 text-xs text-red-600">{execucao.erro}</p> : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  )
}
