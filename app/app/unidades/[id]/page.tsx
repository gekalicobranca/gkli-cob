import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowUpRight, FileSpreadsheet, FileText, History, Save } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getHistoricoOperacionalDaUnidade, getUnidadeIntegral } from '@/features/unidades/queries'
import { updateUnidade } from '@/features/unidades/actions'
import { StatusBadge } from '@/components/data/status-badge'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getCobrancaStatusOperacional } from '@/lib/core/cobranca-status'
import { solicitarPlanilhaDebitosIndividual } from '@/features/planilhas-debitos/actions'

export default async function UnidadeDetalhePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ planilha?: string }> }) {
  const { id } = await params
  const query = searchParams ? await searchParams : {}
  const scope = await getPermittedCarteiras()
  const unidade = await getUnidadeIntegral(id, scope)
  const historico = await getHistoricoOperacionalDaUnidade(id, scope)

  if (!unidade) {
    notFound()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base Cadastral"
        title={`Unidade ${unidade.identificacao ?? ''}`}
        description="Consulta e edição operacional da unidade, responsável e contatos."
        actions={
          <>
            <ButtonLink href="/app/unidades" variant="secondary">Voltar</ButtonLink>
            <form action={solicitarPlanilhaDebitosIndividual}>
              <input type="hidden" name="origem" value="unidade" />
              <input type="hidden" name="id" value={id} />
              <Button type="submit" variant="secondary">
                <FileSpreadsheet size={16} />
                Pedir planilha
              </Button>
            </form>
            <ButtonLink href={`/app/unidades/${id}/laudo-pre-juridico`} variant="secondary">
              <FileText size={16} />
              Laudo pré-jurídico
            </ButtonLink>
            <ButtonLink href="#cadastro">Editar cadastro</ButtonLink>
          </>
        }
      />

      {query.planilha === 'solicitada' || query.planilha === 'existente' ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          {query.planilha === 'solicitada'
            ? 'Solicitação individual criada. A planilha desta unidade entrou na fila de Pendências.'
            : 'Já existe uma solicitação de planilha aberta para esta unidade.'}
        </div>
      ) : null}



      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Cobranças</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{historico.resumo.totalCobrancas}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Em aberto</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{formatCurrency(historico.resumo.valorEmAberto)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Acordos</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{historico.resumo.acordosTotal}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Alerta</p>
          <p className={`mt-2 text-sm font-semibold ${historico.resumo.possuiJudicializacao ? 'text-red-700' : 'text-emerald-700'}`}>{historico.resumo.possuiJudicializacao ? 'Judicialização na unidade' : 'Sem bloqueio judicial'}</p>
        </Card>
      </section>

      <Card className="p-0 overflow-hidden">
        <div className="border-b border-slate-100 bg-white/80 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-100 p-2 text-slate-700"><History size={18} /></div>
            <div>
              <h2 className="text-base font-medium text-slate-950">Histórico da unidade</h2>
              <p className="mt-1 text-sm text-slate-500">Últimos movimentos de cobrança e acordos, sem repetir a ficha cadastral.</p>
            </div>
          </div>
        </div>
        <div className="grid gap-0 xl:grid-cols-2">
          <div className="border-b border-slate-100 p-5 xl:border-b-0 xl:border-r">
            <h3 className="text-sm font-semibold text-slate-950">Cobranças recentes</h3>
            <div className="mt-4 space-y-3">
              {historico.cobrancas.slice(0, 6).map((cobranca: any) => (
                <Link key={cobranca.id} href={`/app/cobrancas/${cobranca.id}`} className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-100 px-4 py-3 transition hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><StatusBadge status={getCobrancaStatusOperacional(cobranca)} /><span className="text-xs text-slate-500">{formatDateBR(cobranca.vencimento)}</span></div>
                    <p className="mt-1 text-sm font-medium text-slate-950">{formatCurrency(Number(cobranca.valor_atualizado ?? cobranca.valor_original ?? 0))}</p>
                  </div>
                  <ArrowUpRight size={15} className="shrink-0 text-slate-400 group-hover:text-[var(--gkli-primary)]" />
                </Link>
              ))}
              {historico.cobrancas.length === 0 ? <p className="text-sm text-slate-500">Nenhuma cobrança registrada.</p> : null}
            </div>
          </div>

          <div className="p-5">
            <h3 className="text-sm font-semibold text-slate-950">Acordos e eventos</h3>
            <div className="mt-4 space-y-3">
              {historico.acordos.slice(0, 6).map((acordo: any) => (
                <Link key={acordo.id} href={`/app/acordos/${acordo.id}`} className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-100 px-4 py-3 transition hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><StatusBadge status={acordo.status} /><span className="text-xs text-slate-500">{formatDateBR(acordo.data_acordo)}</span></div>
                    <p className="mt-1 text-sm font-medium text-slate-950">{formatCurrency(Number(acordo.valor_acordado ?? 0))}</p>
                  </div>
                  <ArrowUpRight size={15} className="shrink-0 text-slate-400 group-hover:text-[var(--gkli-primary)]" />
                </Link>
              ))}
              {historico.acordos.length === 0 ? <p className="text-sm text-slate-500">Nenhum acordo registrado.</p> : null}
            </div>
          </div>
        </div>
      </Card>

      <Card id="cadastro" className="p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-950">Editar cadastro</h2>
          <p className="mt-1 text-sm text-slate-500">Atualize os dados mestres da unidade. Essas informações alimentam cobrança, acordos e mensageria.</p>
        </div>

        <form action={updateUnidade} className="space-y-5">
          <input type="hidden" name="id" value={unidade.id} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Carteira</div>
              <div className="mt-2 text-sm font-semibold text-slate-950">{unidade.carteiras?.nome ?? 'Carteira não informada'}</div>
              <p className="mt-1 text-xs text-slate-500">Campo bloqueado na edição para preservar o vínculo operacional da unidade.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Condomínio</div>
              <div className="mt-2 text-sm font-semibold text-slate-950">{unidade.condominios?.nome ?? 'Condomínio não informado'}</div>
              <p className="mt-1 text-xs text-slate-500">Para trocar a unidade de condomínio, crie uma nova unidade ou faça ajuste técnico controlado.</p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <FormField label="Identificação da unidade">
              <Input name="identificacao" required defaultValue={unidade.identificacao ?? ''} placeholder="Ex.: 101, 305, Casa 12" />
            </FormField>

            <FormField label="Bloco">
              <Input name="bloco" defaultValue={unidade.bloco ?? ''} placeholder="Ex.: A" />
            </FormField>

            <FormField label="Status">
              <Select name="status" defaultValue={unidade.status ?? 'ativa'}>
                <option value="ativa">Ativa</option>
                <option value="inativa">Inativa</option>
                <option value="suspensa">Suspensa</option>
              </Select>
            </FormField>

            <FormField label="Responsável">
              <Input name="responsavel_nome" defaultValue={unidade.responsavel_nome ?? ''} placeholder="Nome do responsável" />
            </FormField>

            <FormField label="Documento">
              <Input name="responsavel_documento" defaultValue={unidade.responsavel_documento ?? ''} placeholder="CPF/CNPJ" />
            </FormField>

            <FormField label="Telefone">
              <Input name="telefone" defaultValue={unidade.telefone ?? ''} placeholder="WhatsApp/telefone" />
            </FormField>

            <FormField label="E-mail">
              <Input name="email" type="email" defaultValue={unidade.email ?? ''} placeholder="email@exemplo.com" />
            </FormField>
          </div>

          <FormField label="Observações">
            <Textarea name="observacoes" defaultValue={unidade.observacoes ?? ''} placeholder="Observações internas..." />
          </FormField>

          <div className="flex justify-end gap-2">
            <ButtonLink href="/app/unidades" variant="secondary">Cancelar</ButtonLink>
            <Button type="submit"><Save size={16} />Salvar alterações</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
