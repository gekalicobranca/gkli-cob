import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/data/status-badge";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import {
  getPendenciaPlanilhaDebitosAberta,
  listCobrancasDaUnidadeParaAcordo,
} from "@/features/acordos/queries";
import { solicitarPlanilhaDebitosAdministradora } from "@/features/acordos/actions";
import { COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO } from "@/lib/core/status";

type PageProps = {
  searchParams: Promise<{
    cobrancaId?: string;
    cobranca_id?: string;
    unidadeId?: string;
    unidade_id?: string;
    planilha?: string;
  }>;
};

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getValorAtualizado(cobranca: any) {
  const calculado = Math.max(
    0,
    asNumber(cobranca.valor_original) +
      asNumber(cobranca.juros) +
      asNumber(cobranca.multa) +
      asNumber(cobranca.correcao) -
      asNumber(cobranca.desconto),
  );
  return asNumber(cobranca.valor_atualizado) || calculado;
}

function isBloqueada(cobranca: any) {
  const status = cobranca.status_operacional ?? cobranca.status;
  return (
    cobranca.unidade_bloqueada_por_judicializacao ||
    (COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO as string[]).includes(status)
  );
}

export default async function SelecionarCobrancasAcordoPage({
  searchParams,
}: PageProps) {
  const query = await searchParams;
  const cobrancaId = query.cobrancaId ?? query.cobranca_id;
  const unidadeId = query.unidadeId ?? query.unidade_id;
  const scope = await getPermittedCarteiras();
  const data = await listCobrancasDaUnidadeParaAcordo({
    scope,
    cobrancaId,
    unidadeId,
  });
  const cobrancas = data.cobrancas as any[];
  const origem =
    cobrancas.find((item) => item.id === data.cobrancaOrigemId) ?? cobrancas[0];
  const unidade = origem?.unidades;
  const condominio = origem?.condominios;
  const pendenciaPlanilha = origem
    ? await getPendenciaPlanilhaDebitosAberta({
        scope,
        carteiraId: origem.carteira_id,
        condominioId: origem.condominio_id,
        unidadeId: origem.unidade_id,
      })
    : null;
  const acordoBloqueadoPorPlanilha = Boolean(pendenciaPlanilha);
  const acordoBloqueadoPorJudicializacao = Boolean((data as any).unidadeBloqueadaPorJudicializacao);
  const selecionaveis = cobrancas.filter((item) => !isBloqueada(item));
  const totalSelecionavel = selecionaveis.reduce(
    (total, item) => total + getValorAtualizado(item),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Base Operacional"
        title="Agrupar cobranças para acordo"
        description="Agrupe manualmente os recibos/vencimentos da unidade antes de abrir a simulação do acordo. A régua orienta a cobrança, mas a seleção final é do operador."
        actions={
          <ButtonLink href="/app/acordos" variant="header">
            Voltar
          </ButtonLink>
        }
      />

      {cobrancas.length === 0 ? (
        <Card>
          <h2 className="text-lg font-semibold text-slate-950">
            Nenhuma cobrança encontrada
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Não localizei cobranças para a unidade informada dentro do seu
            escopo de carteira.
          </p>
        </Card>
      ) : (
        <form
          action="/app/acordos/novo"
          className="grid gap-6 xl:grid-cols-[1fr_360px]"
        >
          <input type="hidden" name="cobranca_id_origem" value={origem?.id ?? ""} />
          <input type="hidden" name="unidade_id" value={data.unidadeId ?? ""} />
          <Card className="space-y-4">
            <div className="rounded-2xl border border-[#DDE5E2] bg-[#F6F8F7] p-4">
              <p className="text-sm font-semibold text-slate-950">
                {condominio?.nome ?? "Condomínio não informado"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Unidade {unidade?.identificacao ?? "-"}
                {unidade?.bloco ? ` · Bloco ${unidade.bloco}` : ""} ·{" "}
                {unidade?.responsavel_nome ?? "Responsável não informado"}
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="w-12 px-4 py-3">Sel.</th>
                    <th className="px-4 py-3">Vencimento</th>
                    <th className="px-4 py-3">Competência</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {cobrancas.map((cobranca) => {
                    const bloqueada = isBloqueada(cobranca);
                    const defaultChecked =
                      cobranca.id === data.cobrancaOrigemId ||
                      (!data.cobrancaOrigemId && !bloqueada);
                    return (
                      <tr
                        key={cobranca.id}
                        className={bloqueada ? "bg-slate-50 opacity-70" : ""}
                      >
                        <td className="px-4 py-3 align-top">
                          <input
                            type="checkbox"
                            name="cobrancaIds"
                            value={cobranca.id}
                            defaultChecked={defaultChecked && !bloqueada}
                            disabled={bloqueada}
                            className="h-4 w-4 rounded border-slate-300 accent-[var(--gkli-primary)]"
                          />
                        </td>
                        <td className="px-4 py-3 align-top font-medium text-slate-950">
                          {formatDateBR(cobranca.vencimento)}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600">
                          {cobranca.competencia ?? "-"}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <StatusBadge
                            status={
                              cobranca.status_operacional ?? cobranca.status
                            }
                          />
                        </td>
                        <td className="px-4 py-3 align-top text-right font-semibold text-slate-950">
                          {formatCurrency(getValorAtualizado(cobranca))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="space-y-4">
            <Card>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gkli-primary)]">
                Agrupamento
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">
                Seleção livre por unidade
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Marque apenas os recibos que farão parte do acordo. Débitos fora
                da régua aparecem aqui também; cobranças já bloqueadas para novo
                acordo ficam travadas. Unidades com judicialização ativa também bloqueiam novas dívidas/vincendas para acordo.
              </p>
              {acordoBloqueadoPorJudicializacao ? (
                <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-950">
                    Unidade bloqueada para acordo
                  </p>
                  <p className="mt-1 text-sm leading-6 text-red-900">
                    Esta unidade possui cobrança judicializada. Novas dívidas e vincendas continuam visíveis para saneamento, mas não podem ser agrupadas em acordo até decisão do gestor da carteira.
                  </p>
                </div>
              ) : null}

              {query.planilha === "solicitada" ? (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Pendência criada para solicitar a planilha de débitos à administradora.
                </div>
              ) : null}

              {acordoBloqueadoPorPlanilha ? (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-950">
                    Acordo bloqueado por conferência administrativa
                  </p>
                  <p className="mt-1 text-sm leading-6 text-amber-900">
                    Existe uma pendência aberta de planilha de débitos para esta unidade. Resolva a pendência antes de efetivar o acordo.
                  </p>
                </div>
              ) : null}

              <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Total selecionável
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">
                  {formatCurrency(totalSelecionavel)}
                </p>
              </div>
              <div className="mt-5 grid gap-2">
                <button
                  type="submit"
                  disabled={acordoBloqueadoPorPlanilha || acordoBloqueadoPorJudicializacao || selecionaveis.length === 0}
                  className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-transparent bg-[var(--gkli-primary)] px-4 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--gkli-primary-hover)] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  Simular acordo
                </button>
                <button
                  type="submit"
                  formAction={solicitarPlanilhaDebitosAdministradora}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-950 shadow-sm transition hover:bg-amber-100"
                >
                  Pedir planilha de débitos à administradora
                </button>
                <p className="text-xs leading-5 text-slate-500">
                  Opcional. Ao acionar, o sistema gera uma pendência administrativa e bloqueia a efetivação do acordo até a resolução.
                </p>
              </div>
            </Card>

            {origem ? (
              <Link
                href={`/app/cobrancas/${origem.id}`}
                className="block text-center text-sm font-medium text-slate-500 hover:text-slate-950"
              >
                Voltar para cobrança de origem
              </Link>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}
