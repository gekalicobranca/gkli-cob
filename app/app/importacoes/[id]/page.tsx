import { notFound } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  ShieldX,
  WalletCards,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/data/status-badge'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getImportacaoDetalhe, listImportacaoItens } from '@/features/importacoes/queries'
import { confirmarImportacao } from '@/features/importacoes/actions'
import { priorityTone } from '@/features/importacoes/preview-rules'

type PageProps = {
  params: Promise<{ id: string }>
}

function getAlertas(erros: string[] = []) {
  return erros.filter((erro) => erro.startsWith('ALERTA:')).map((erro) => erro.replace('ALERTA:', '').trim())
}

function getErrosBloqueantes(erros: string[] = []) {
  return erros.filter((erro) => !erro.startsWith('ALERTA:'))
}

export default async function ImportacaoDetalhePage({ params }: PageProps) {
  const { id } = await params
  const scope = await getPermittedCarteiras()

  const [importacao, itens] = await Promise.all([
    getImportacaoDetalhe(id, scope),
    listImportacaoItens(id),
  ])

  if (!importacao) {
    notFound()
  }

  const resumo = importacao.resumo ?? {}
  const linhasComAlerta = itens.filter((item: any) => getAlertas(item.erros ?? []).length > 0).length
  const bloqueadas = itens.filter((item: any) => !item.valido).length
  const canConfirm = importacao.status !== 'concluida' && importacao.total_validas > 0

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Preview de importação"
        title={importacao.arquivo_nome ?? 'Arquivo sem nome'}
        description={`${importacao.tipo} · criada em ${formatDateBR(importacao.created_at)} · CNPJ do condomínio é a chave obrigatória para cobranças.`}
        actions={
          <>
            <ButtonLink href="/app/importacoes" variant="secondary">Voltar</ButtonLink>

            {canConfirm ? (
              <form action={confirmarImportacao}>
                <input type="hidden" name="importacao_id" value={importacao.id} />
                <Button type="submit">Confirmar importação</Button>
              </form>
            ) : null}
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-emerald-50 p-2 text-emerald-700">
            <CheckCircle2 size={18} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Válidas
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {importacao.total_validas}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            linhas prontas para importar
          </p>
        </Card>

        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-red-50 p-2 text-red-700">
            <ShieldX size={18} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Bloqueadas
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {bloqueadas}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            não serão importadas
          </p>
        </Card>

        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-amber-50 p-2 text-amber-700">
            <AlertTriangle size={18} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Alertas
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {linhasComAlerta}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            importam, mas exigem atenção
          </p>
        </Card>

        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
            <WalletCards size={18} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Valor válido
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            {formatCurrency(Number(resumo.valor_total_valido ?? 0))}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            impacto financeiro previsto
          </p>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-medium text-slate-950">
              Preview inteligente
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Linhas válidas serão importadas. Linhas bloqueadas não entram na base.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {itens.map((item: any) => {
              const alertas = getAlertas(item.erros ?? [])
              const erros = getErrosBloqueantes(item.erros ?? [])
              const payload = item.payload ?? {}
              const prioridade = payload.prioridade_estimada ?? (item.valido ? 'baixa' : 'bloqueada')

              return (
                <div
                  key={item.id}
                  className="grid gap-4 px-5 py-4 xl:grid-cols-[80px_minmax(280px,1.3fr)_140px_140px_170px]"
                >
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                      Linha
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-950">{item.linha}</p>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={item.valido ? 'válida' : 'bloqueada'} />
                      <Badge tone={priorityTone(prioridade) as any}>{prioridade}</Badge>
                      {payload.unidade_nova ? <Badge tone="yellow">unidade nova</Badge> : <Badge tone="green">unidade ok</Badge>}
                    </div>

                    <p className="mt-2 truncate text-sm font-medium text-slate-950">
                      {payload.responsavel_nome || 'Responsável não informado'} · Unidade {payload.unidade || '-'}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {payload.condominio_nome || 'Condomínio não localizado'} · CNPJ {payload.condominio_cnpj || '-'}
                    </p>

                    {erros.length > 0 ? (
                      <div className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-700">
                        {erros.join(' · ')}
                      </div>
                    ) : null}

                    {alertas.length > 0 ? (
                      <div className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        {alertas.join(' · ')}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                      Valor
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">
                      {formatCurrency(Number(payload.valor_atualizado ?? 0))}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                      Vencimento
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {formatDateBR(payload.vencimento)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                      Ação sugerida
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {payload.acao_sugerida ?? 'Corrigir antes de importar'}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      score {payload.score_estimado ?? 0}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <h2 className="text-base font-medium text-slate-950">
              Impacto operacional
            </h2>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Prioridade alta</span>
                <strong className="font-semibold text-slate-950">
                  {Number(resumo.prioridade_alta ?? 0)} linhas
                </strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Unidades novas</span>
                <strong className="font-semibold text-slate-950">
                  {Number(resumo.unidades_novas ?? 0)}
                </strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Linhas com alerta</span>
                <strong className="font-semibold text-slate-950">
                  {Number(resumo.linhas_com_alerta ?? 0)}
                </strong>
              </div>
            </div>
          </Card>

          <Card className="border-red-200 bg-red-50">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-white p-2 text-red-700">
                <FileWarning size={18} />
              </div>
              <div>
                <h2 className="text-base font-medium text-red-950">
                  Regra de segurança
                </h2>
                <p className="mt-2 text-sm leading-6 text-red-800">
                  Condomínios não são criados automaticamente. Se o CNPJ não estiver cadastrado, a linha fica bloqueada.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-base font-medium text-slate-950">
              Próximo refinamento
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Quando você enviar as planilhas de acordos em andamento, vamos criar o parser de legados com preview próprio: acordo, parcelas, status e vínculo por CNPJ.
            </p>
          </Card>
        </div>
      </section>
    </div>
  )
}
