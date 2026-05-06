import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/data/status-badge'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getCobrancaDetalhe, listInteracoesDaCobranca } from '@/features/cobrancas/queries'
import { createInteracaoCobranca, updateCobrancaStatus } from '@/features/cobrancas/actions'

type PageProps = {
  params: Promise<{ id: string }>
}

const statusOptions = [
  'novo',
  'em cobrança ativa',
  'em negociação',
  'acordo firmado',
  'acordo efetivado',
  'judicializado',
  'suspenso',
]

export default async function CobrancaDetalhePage({ params }: PageProps) {
  const { id } = await params
  const scope = await getPermittedCarteiras()

  const [cobranca, interacoes] = await Promise.all([
    getCobrancaDetalhe(id, scope),
    listInteracoesDaCobranca(id),
  ])

  if (!cobranca) {
    notFound()
  }

  const canCreateAcordo = ['novo', 'em cobrança ativa', 'em negociação'].includes(cobranca.status)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cobrança"
        title={`${cobranca.unidades?.responsavel_nome ?? 'Responsável não informado'} · Unidade ${cobranca.unidades?.identificacao ?? '-'}`}
        description={`${cobranca.condominios?.nome ?? '-'} · competência ${cobranca.competencia ?? '-'} · vencimento ${formatDateBR(cobranca.vencimento)}`}
        actions={
          <>
            {canCreateAcordo ? (
              <ButtonLink href={`/app/acordos/novo?cobrancaId=${cobranca.id}`}>Criar acordo</ButtonLink>
            ) : null}
            <ButtonLink href="/app/cobrancas" variant="secondary">Voltar</ButtonLink>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-sm font-semibold text-slate-500">Status</p>
          <div className="mt-3">
            <StatusBadge status={cobranca.status} />
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-slate-500">Valor original</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{formatCurrency(Number(cobranca.valor_original))}</p>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-slate-500">Valor atualizado</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{formatCurrency(Number(cobranca.valor_atualizado))}</p>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-slate-500">Última interação</p>
          <p className="mt-3 text-lg font-semibold text-slate-950">{formatDateBR(cobranca.ultima_interacao_at)}</p>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-slate-950">Atualizar status</h2>
            <form action={updateCobrancaStatus} className="mt-4 flex flex-col gap-3 md:flex-row">
              <input type="hidden" name="cobranca_id" value={cobranca.id} />
              <select
                name="status"
                defaultValue={cobranca.status}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <Button type="submit">Salvar status</Button>
            </form>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-slate-950">Registrar interação</h2>
            <form action={createInteracaoCobranca} className="mt-4 space-y-4">
              <input type="hidden" name="cobranca_id" value={cobranca.id} />
              <input type="hidden" name="carteira_id" value={cobranca.carteira_id} />

              <select
                name="tipo"
                defaultValue="registro"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none"
              >
                <option value="registro">registro</option>
                <option value="whatsapp">whatsapp</option>
                <option value="ligacao">ligação</option>
                <option value="email">e-mail</option>
                <option value="negociacao">negociação</option>
                <option value="alerta">alerta</option>
              </select>

              <Textarea name="conteudo" required placeholder="Descreva o contato, retorno do responsável, proposta ou próxima ação..." />

              <div className="flex justify-end">
                <Button type="submit">Salvar interação</Button>
              </div>
            </form>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-950">Linha do tempo</h2>
              <p className="mt-1 text-sm text-slate-500">Histórico operacional desta cobrança.</p>
            </div>

            {interacoes.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">Nenhuma interação registrada.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {interacoes.map((interacao: any) => (
                  <div key={interacao.id} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-semibold text-slate-950">{interacao.tipo}</p>
                      <p className="text-xs text-slate-500">{formatDateBR(interacao.created_at)}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{interacao.conteudo}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      Por {interacao.profiles?.nome ?? interacao.profiles?.email ?? 'usuário não identificado'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="text-lg font-semibold text-slate-950">Responsável</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>Nome: {cobranca.unidades?.responsavel_nome ?? '-'}</p>
              <p>Documento: {cobranca.unidades?.responsavel_documento ?? '-'}</p>
              <p>Telefone: {cobranca.unidades?.telefone ?? '-'}</p>
              <p>E-mail: {cobranca.unidades?.email ?? '-'}</p>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-slate-950">Condomínio</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>Nome: {cobranca.condominios?.nome ?? '-'}</p>
              <p>CNPJ: {cobranca.condominios?.cnpj ?? '-'}</p>
              <p>Administradora: {cobranca.condominios?.administradora ?? '-'}</p>
              <p>Régua: D+{cobranca.condominios?.inicio_cobranca_dias ?? '-'}</p>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-slate-950">Observações</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {cobranca.observacoes ?? 'Nenhuma observação registrada.'}
            </p>
          </Card>
        </div>
      </section>
    </div>
  )
}
